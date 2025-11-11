use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::cmp;
use std::time::Instant;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TimerStatus {
    Idle,
    Running,
    Stopped,
}

impl Default for TimerStatus {
    fn default() -> Self {
        TimerStatus::Idle
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TimerMode {
    Countdown,
    Stopwatch,
    Break,
}

impl Default for TimerMode {
    fn default() -> Self {
        TimerMode::Countdown
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub status: TimerStatus,
    pub mode: TimerMode,
    pub session_id: Option<String>,
    pub target_ms: u64,
    pub active_ms: u64,
    pub started_at: Option<DateTime<Utc>>,
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
            mode: TimerMode::Countdown,
            session_id: None,
            target_ms: 0,
            active_ms: 0,
            started_at: None,
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
        match (self.status, self.mode) {
            (TimerStatus::Idle | TimerStatus::Stopped, _) => 0,
            (TimerStatus::Running, TimerMode::Countdown) => {
                let remaining = self.target_ms as i64 - self.current_active_ms() as i64;
                cmp::max(remaining, 0)
            }
            (TimerStatus::Running, TimerMode::Break) => {
                // Break mode works like countdown
                let remaining = self.target_ms as i64 - self.current_active_ms() as i64;
                cmp::max(remaining, 0)
            }
            (TimerStatus::Running, TimerMode::Stopwatch) => {
                // For stopwatch, return elapsed time (active_ms) as positive
                self.current_active_ms() as i64
            }
        }
    }

    pub fn current_active_ms(&self) -> u64 {
        if let (TimerStatus::Running, Some(anchor)) = (self.status, self.running_anchor) {
            self.active_ms_baseline
                .saturating_add(anchor.elapsed().as_millis() as u64)
        } else {
            self.active_ms
        }
    }

    pub fn sync_active_from_anchor(&mut self) {
        if let (TimerStatus::Running, Some(anchor)) = (self.status, self.running_anchor) {
            self.active_ms = self
                .active_ms_baseline
                .saturating_add(anchor.elapsed().as_millis() as u64);
        }
    }

    pub fn begin_session(
        &mut self,
        session_id: String,
        target_ms: u64,
        mode: TimerMode,
        start_at: DateTime<Utc>,
        now: Instant,
    ) {
        *self = Self {
            status: TimerStatus::Running,
            mode,
            session_id: Some(session_id),
            target_ms,
            active_ms: 0,
            started_at: Some(start_at),
            active_ms_baseline: 0,
            running_anchor: Some(now),
        };
    }

    pub fn stop(&mut self) {
        self.sync_active_from_anchor();
        self.status = TimerStatus::Stopped;
        self.running_anchor = None;
        self.active_ms_baseline = self.active_ms;
    }

    pub fn cancel(&mut self) {
        *self = Self::default();
    }
}
