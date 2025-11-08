use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use chrono::Utc;
use log::{error, info};
use serde::Serialize;
use tokio::{sync::Mutex, task::JoinHandle, time};
use uuid::Uuid;

use crate::{
    db::{Database, Session, SessionInfo, SessionStatus},
    sensing::SensingController,
};

#[cfg(target_os = "macos")]
use crate::macos_bridge::{current_uptime_ms, island_reset, island_start, island_sync};

use super::{TimerMode, TimerState, TimerStatus};

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
    sensing: Arc<Mutex<SensingController>>,
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
            sensing: Arc::new(Mutex::new(SensingController::new())),
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

    pub async fn start_timer(&self, target_ms: u64, mode: Option<TimerMode>) -> Result<TimerState> {
        let mode = mode.unwrap_or(TimerMode::Countdown);

        // For stopwatch mode, use i64::MAX as target (essentially unlimited, but SQLite-safe)
        // SQLite INTEGER max is 2^63 - 1 = 9,223,372,036,854,775,807
        let actual_target_ms = match mode {
            TimerMode::Countdown => {
                if target_ms == 0 {
                    return Err(anyhow!("target_ms must be greater than zero for countdown mode"));
                }
                target_ms
            }
            TimerMode::Stopwatch => i64::MAX as u64,
        };

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
            target_ms: actual_target_ms,
            active_ms: 0,
            created_at: started_at,
            updated_at: started_at,
        };

        self.db.insert_session(&session).await?;

        // Initialize state without the anchor yet
        {
            let mut state = self.state.lock().await;
            state.begin_session(session_id.clone(), actual_target_ms, mode, started_at, Instant::now());
        }

        self.sensing
            .lock()
            .await
            .start_sensing(session_id, self.db.clone())
            .await?;

        self.spawn_ticker().await;

        // Reset the anchor NOW, right before emitting, to avoid accumulated time
        {
            let mut state = self.state.lock().await;
            state.running_anchor = Some(Instant::now());
            state.active_ms_baseline = 0;
            state.active_ms = 0;
        }

        #[cfg(target_os = "macos")]
        {
            let start_uptime_ms = current_uptime_ms();
            let island_target_ms = match mode {
                TimerMode::Countdown => {
                    let clamped = actual_target_ms.min(i64::MAX as u64);
                    clamped as i64
                }
                TimerMode::Stopwatch => 0,
            };
            let mode_str = match mode {
                TimerMode::Countdown => "countdown",
                TimerMode::Stopwatch => "stopwatch",
            };

            island_start(start_uptime_ms, island_target_ms, mode_str);
        }

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

            // Allow manual end for both countdown and stopwatch modes
            // Users should be able to end any timer early from the island UI

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

        self.sensing.lock().await.stop_sensing().await?;
        self.cancel_ticker().await;

        #[cfg(target_os = "macos")]
        {
            island_reset();
        }

        self.db
            .mark_session_status(
                &session_snapshot.id,
                SessionStatus::Completed,
                session_snapshot.active_ms,
                session_snapshot.stopped_at,
                stopped_at,
            )
            .await?;

        // Run segmentation synchronously so UI can render results immediately
        {
            use crate::segmentation::{segment_session, SegmentationConfig};

            let session_id = session_snapshot.id.clone();

            match self
                .db
                .get_context_readings_for_session(&session_id)
                .await
            {
                Ok(readings) => match segment_session(readings, &SegmentationConfig::default()) {
                    Ok((segments, interruptions)) => {
                        if let Err(e) = self.db.insert_segments(&session_id, &segments).await {
                            error!("Failed to insert segments: {}", e);
                        } else if let Err(e) = self.db.insert_interruptions(&interruptions).await {
                            error!("Failed to insert interruptions: {}", e);
                        } else {
                            info!(
                                "Created {} segments and {} interruptions for session {}",
                                segments.len(),
                                interruptions.len(),
                                session_id
                            );
                        }
                    }
                    Err(e) => {
                        error!("Segmentation failed: {}", e);
                    }
                },
                Err(e) => {
                    error!("Failed to load readings for segmentation: {}", e);
                }
            }
        }

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
                #[cfg(target_os = "macos")]
                {
                    island_reset();
                }
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

        self.sensing.lock().await.stop_sensing().await?;
        self.cancel_ticker().await;

        #[cfg(target_os = "macos")]
        {
            island_reset();
        }

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
        let sensing = self.sensing.clone();

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

                #[cfg(target_os = "macos")]
                {
                    island_sync(snapshot.remaining_ms());
                }

                // Only auto-stop in countdown mode when timer reaches 0
                if remaining <= 0 && snapshot.mode == TimerMode::Countdown {
                    let final_snapshot = {
                        let mut guard = state.lock().await;
                        guard.sync_active_from_anchor();
                    guard.stop();
                    guard.active_ms = guard.active_ms.min(guard.target_ms);
                    guard.clone()
                };

                #[cfg(target_os = "macos")]
                {
                    island_reset();
                }

                // Stop sensing immediately
                if let Err(e) = sensing.lock().await.stop_sensing().await {
                    error!("Failed to stop sensing on timer completion: {}", e);
                }

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

                            let _ = app_handle_clone.emit("timer-heartbeat", heartbeat_payload);
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
