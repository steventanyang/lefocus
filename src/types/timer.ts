// Timer type definitions matching Rust backend

export type TimerStatus = "idle" | "running" | "stopped";

export interface TimerState {
  status: TimerStatus;
  session_id: string | null;
  target_ms: number;
  active_ms: number;
  started_at: string | null;
}

export interface TimerSnapshot {
  state: TimerState;
  remaining_ms: number;
}
