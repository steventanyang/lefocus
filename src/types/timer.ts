// Timer type definitions matching Rust backend

export type TimerStatus = "idle" | "running" | "stopped";

export type TimerMode = "countdown" | "stopwatch";

export type SessionStatus = "active" | "completed" | "interrupted";

export interface TimerState {
  status: TimerStatus;
  mode: TimerMode;
  session_id: string | null;
  target_ms: number;
  active_ms: number;
  started_at: string | null;
}

export interface TimerSnapshot {
  state: TimerState;
  remaining_ms: number;
}

export interface SessionInfo {
  id: string;
  startedAt: string; // ISO 8601 datetime
  stoppedAt: string | null; // ISO 8601 datetime
  status: SessionStatus;
  targetMs: number;
  activeMs: number;
}

export interface TopApp {
  bundleId: string;
  appName: string | null;
  durationSecs: number;
  percentage: number;
}

export interface SessionSummary {
  id: string;
  startedAt: string; // ISO 8601 datetime
  stoppedAt: string | null; // ISO 8601 datetime
  status: SessionStatus;
  targetMs: number;
  activeMs: number;
  topApps: TopApp[];
  appIcons: Record<string, string | null>; // bundleId -> icon data URL (base64 PNG)
  appColors: Record<string, string | null>; // bundleId -> icon color (hex like "#AABBCC")
}
