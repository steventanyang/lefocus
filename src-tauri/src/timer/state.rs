use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::cmp;
use std::time::Instant;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TimerStatus {
    Idle,
    Running,
    Paused,
    Stopped,
}

impl Default for TimerStatus {
    fn default() -> Self {
        TimerStatus::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub status: TimerStatus,
    pub session_id: Option<String>,
    pub target_ms: u64,
    pub active_ms: u64,
    pub paused_ms: u64,
    pub started_at: Option<DateTime<Utc>>,
    pub last_pause_started_at: Option<DateTime<Utc>>,
    #[serde(skip)]
    pub active_pause_id: Option<String>,
    /// Time accumulated from earlier running windows; combines with `running_anchor`
    /// to compute the true active duration.
    #[serde(skip)]
    pub active_ms_baseline: u64,
    #[serde(skip)]
    pub running_anchor: Option<Instant>,
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            status: TimerStatus::Idle,
            session_id: None,
            target_ms: 0,
            active_ms: 0,
            paused_ms: 0,
            started_at: None,
            last_pause_started_at: None,
            active_pause_id: None,
            active_ms_baseline: 0,
            running_anchor: None,
        }
    }
}

impl TimerState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn remaining_ms(&self) -> i64 {
        match self.status {
            TimerStatus::Idle => 0,
            TimerStatus::Stopped => 0,
            TimerStatus::Running | TimerStatus::Paused => {
                let remaining =
                    self.target_ms as i64 - self.current_active_ms() as i64;
                cmp::max(remaining, 0)
            }
        }
    }

    pub fn current_active_ms(&self) -> u64 {
        match (self.status, self.running_anchor) {
            (TimerStatus::Running, Some(anchor)) => {
                self.active_ms_baseline
                    .saturating_add(anchor.elapsed().as_millis() as u64)
            }
            _ => self.active_ms,
        }
    }

    pub fn sync_active_from_anchor(&mut self) {
        if let (TimerStatus::Running, Some(anchor)) =
            (self.status, self.running_anchor)
        {
            self.active_ms = self
                .active_ms_baseline
                .saturating_add(anchor.elapsed().as_millis() as u64);
        }
    }

    pub fn begin_session(
        &mut self,
        session_id: String,
        target_ms: u64,
        start_at: DateTime<Utc>,
        now: Instant,
    ) {
        *self = Self {
            status: TimerStatus::Running,
            session_id: Some(session_id),
            target_ms,
            active_ms: 0,
            paused_ms: 0,
            started_at: Some(start_at),
            last_pause_started_at: None,
            active_pause_id: None,
            active_ms_baseline: 0,
            running_anchor: Some(now),
        };
    }

    pub fn resume(&mut self, now: Instant) {
        self.sync_active_from_anchor();
        self.status = TimerStatus::Running;
        self.active_ms_baseline = self.active_ms;
        self.running_anchor = Some(now);
        self.last_pause_started_at = None;
        self.active_pause_id = None;
    }

    pub fn pause(&mut self, paused_at: DateTime<Utc>) {
        self.sync_active_from_anchor();
        self.status = TimerStatus::Paused;
        self.running_anchor = None;
        self.active_ms_baseline = self.active_ms;
        self.last_pause_started_at = Some(paused_at);
    }

    pub fn stop(&mut self) {
        self.sync_active_from_anchor();
        self.status = TimerStatus::Stopped;
        self.running_anchor = None;
        self.active_ms_baseline = self.active_ms;
        self.active_pause_id = None;
    }

    pub fn cancel(&mut self) {
        *self = Self::default();
    }

    pub fn is_running(&self) -> bool {
        self.status == TimerStatus::Running
    }

    pub fn set_running_anchor(&mut self, now: Instant) {
        self.active_ms_baseline = self.active_ms;
        self.running_anchor = Some(now);
    }

    pub fn set_active_pause(
        &mut self,
        pause_id: Option<String>,
        pause_started_at: Option<DateTime<Utc>>,
    ) {
        self.active_pause_id = pause_id;
        self.last_pause_started_at = pause_started_at;
    }
}
