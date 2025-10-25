use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::Serialize;
use tokio::{sync::Mutex, task::JoinHandle, time};
use uuid::Uuid;

use crate::{
    db::Database,
    models::{Session, SessionInfo, SessionStatus},
};

use super::{TimerState, TimerStatus};

use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Clone)]
pub struct TimerSnapshot {
    pub state: TimerState,
    pub remaining_ms: i64,
}

#[derive(Serialize, Clone)]
struct TimerStateChangedEvent {
    state: TimerState,
    remaining_ms: i64,
}

#[derive(Serialize, Clone)]
struct TimerHeartbeatEvent {
    state: TimerState,
    active_ms: u64,
    remaining_ms: i64,
}

#[derive(Serialize, Clone)]
struct SessionCompletedEvent {
    session_id: String,
    session: SessionInfo,
}

#[derive(Clone)]
pub struct TimerController {
    state: Arc<Mutex<TimerState>>,
    db: Database,
    app_handle: AppHandle,
    ticker: Arc<Mutex<Option<JoinHandle<()>>>>,
    tick_interval: Duration,
    heartbeat_every_ticks: u32,
}

impl TimerController {
    pub fn new(app_handle: AppHandle, db: Database) -> Self {
        let debug_mode = std::env::var("LEFOCUS_DEBUG")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        Self {
            state: Arc::new(Mutex::new(TimerState::new())),
            db,
            app_handle,
            ticker: Arc::new(Mutex::new(None)),
            tick_interval: Duration::from_secs(1),
            heartbeat_every_ticks: if debug_mode { 1 } else { 10 },
        }
    }

    pub async fn get_state(&self) -> TimerState {
        let mut guard = self.state.lock().await;
        guard.sync_active_from_anchor();
        guard.clone()
    }

    pub async fn get_snapshot(&self) -> TimerSnapshot {
        let mut guard = self.state.lock().await;
        guard.sync_active_from_anchor();
        TimerSnapshot {
            remaining_ms: guard.remaining_ms(),
            state: guard.clone(),
        }
    }

    pub async fn start_timer(&self, target_ms: u64) -> Result<TimerState> {
        if target_ms == 0 {
            return Err(anyhow!("target_ms must be greater than zero"));
        }

        {
            let state = self.state.lock().await;
            if state.status != TimerStatus::Idle {
                return Err(anyhow!("timer already active"));
            }
        }

        let session_id = Uuid::new_v4().to_string();
        let started_at = Utc::now();

        let session = Session {
            id: session_id.clone(),
            started_at,
            stopped_at: None,
            status: SessionStatus::Running,
            target_ms,
            active_ms: 0,
            created_at: started_at,
            updated_at: started_at,
        };

        self.db.insert_session(&session).await?;

        {
            let mut state = self.state.lock().await;
            state.begin_session(
                session_id,
                target_ms,
                started_at,
                Instant::now(),
            );
        }

        self.spawn_ticker().await;
        self.emit_state_changed().await?;

        Ok(self.get_state().await)
    }

    pub async fn end_timer(&self) -> Result<SessionInfo> {
        let stopped_at = Utc::now();

        let session_snapshot = {
            let mut state = self.state.lock().await;
            if state.status == TimerStatus::Idle {
                return Err(anyhow!("no active session to end"));
            }

            state.sync_active_from_anchor();

            let session_id = state
                .session_id
                .clone()
                .ok_or_else(|| anyhow!("missing session id"))?;
            let started_at = state.started_at.unwrap_or_else(Utc::now);
            let target_ms = state.target_ms;
            let active_ms = state.current_active_ms().min(target_ms);

            state.stop();
            state.cancel();

            Session {
                id: session_id,
                started_at,
                stopped_at: Some(stopped_at),
                status: SessionStatus::Completed,
                target_ms,
                active_ms,
                created_at: started_at,
                updated_at: stopped_at,
            }
        };

        self.cancel_ticker().await;

        self.db
            .mark_session_status(
                &session_snapshot.id,
                SessionStatus::Completed,
                session_snapshot.active_ms,
                session_snapshot.stopped_at,
                stopped_at,
            )
            .await?;
        self.emit_state_changed().await?;

        let session_info = SessionInfo::from(session_snapshot);
        self.emit_session_completed(&session_info).await?;

        Ok(session_info)
    }

    pub async fn cancel_timer(&self) -> Result<()> {
        let cancelled_at = Utc::now();
        let (session_id, active_ms) = {
            let mut state = self.state.lock().await;
            if state.status == TimerStatus::Idle {
                return Ok(());
            }
            state.sync_active_from_anchor();
            let session_id = state
                .session_id
                .clone()
                .ok_or_else(|| anyhow!("no active session to cancel"))?;
            let active_ms = state.active_ms;
            state.cancel();
            (session_id, active_ms)
        };

        self.cancel_ticker().await;

        self.db
            .mark_session_status(
                &session_id,
                SessionStatus::Cancelled,
                active_ms,
                Some(cancelled_at),
                cancelled_at,
            )
            .await?;
        self.emit_state_changed().await?;
        Ok(())
    }

    async fn spawn_ticker(&self) {
        let mut ticker_guard = self.ticker.lock().await;
        if let Some(handle) = ticker_guard.take() {
            handle.abort();
        }

        let state = self.state.clone();
        let app_handle = self.app_handle.clone();
        let db = self.db.clone();
        let tick_interval = self.tick_interval;
        let heartbeat_every = self.heartbeat_every_ticks;

        let handle = tokio::spawn(async move {
            let mut interval = time::interval(tick_interval);
            let mut ticks: u32 = 0;
            loop {
                interval.tick().await;

                let (snapshot, remaining) = {
                    let mut guard = state.lock().await;
                    if guard.status != TimerStatus::Running {
                        break;
                    }
                    guard.sync_active_from_anchor();
                    let remaining = guard.remaining_ms();
                    let snapshot = guard.clone();
                    (snapshot, remaining)
                };

                if remaining <= 0 {
                    let final_snapshot = {
                        let mut guard = state.lock().await;
                        guard.sync_active_from_anchor();
                        guard.stop();
                        guard.active_ms = guard.active_ms.min(guard.target_ms);
                        guard.clone()
                    };

                    emit_timer_state(&app_handle, final_snapshot.clone());

                    if let Some(session_id) = final_snapshot.session_id.clone() {
                        let db_clone = db.clone();
                        tokio::spawn(async move {
                            let _ = db_clone
                                .update_session_progress(
                                    &session_id,
                                    final_snapshot.active_ms,
                                    Utc::now(),
                                )
                                .await;
                        });
                    }

                    break;
                }

                ticks = ticks.wrapping_add(1);

                if let Some(session_id) = snapshot.session_id.clone() {
                    if ticks % heartbeat_every == 0 {
                        let heartbeat_payload = TimerHeartbeatEvent {
                            state: snapshot.clone(),
                            active_ms: snapshot.active_ms,
                            remaining_ms: snapshot.remaining_ms(),
                        };

                        let db_clone = db.clone();
                        let app_handle_clone = app_handle.clone();
                        let session_id_clone = session_id.clone();
                        let snapshot_clone = snapshot.clone();

                        tokio::spawn(async move {
                            let now = Utc::now();
                            let _ = db_clone
                                .update_session_progress(
                                    &session_id_clone,
                                    snapshot_clone.active_ms,
                                    now,
                                )
                                .await;

                            let _ = app_handle_clone.emit(
                                "timer-heartbeat",
                                heartbeat_payload,
                            );
                        });
                    }
                }
            }
        });

        *ticker_guard = Some(handle);
    }

    async fn cancel_ticker(&self) {
        if let Some(handle) = self.ticker.lock().await.take() {
            handle.abort();
        }
    }

    async fn emit_state_changed(&self) -> Result<()> {
        let mut guard = self.state.lock().await;
        guard.sync_active_from_anchor();
        emit_timer_state(&self.app_handle, guard.clone());
        Ok(())
    }

    async fn emit_session_completed(&self, session_info: &SessionInfo) -> Result<()> {
        let payload = SessionCompletedEvent {
            session_id: session_info.id.clone(),
            session: session_info.clone(),
        };

        self.app_handle
            .emit("session-completed", payload)
            .map_err(|err| anyhow!("failed to emit session-completed: {err}"))
    }
}

fn emit_timer_state(app_handle: &AppHandle, state: TimerState) {
    let payload = TimerStateChangedEvent {
        remaining_ms: state.remaining_ms(),
        state,
    };

    let _ = app_handle.emit("timer-state-changed", payload);
}
