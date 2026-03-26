export const TIMER_PRESETS_MS = {
  POMODORO: 25 * 60 * 1000,
  FOCUS_45: 45 * 60 * 1000,
  FOCUS_90: 90 * 60 * 1000,
} as const;

export const PRESETS = [
  { label: "25 m", ms: TIMER_PRESETS_MS.POMODORO },
  { label: "45 m", ms: TIMER_PRESETS_MS.FOCUS_45 },
  { label: "90 m", ms: TIMER_PRESETS_MS.FOCUS_90 },
] as const;

/** Break mode presets (aligned with desktop app) */
export const BREAK_PRESETS = [
  { label: "5 m", ms: 5 * 60 * 1000 },
  { label: "10 m", ms: 10 * 60 * 1000 },
  { label: "15 m", ms: 15 * 60 * 1000 },
] as const;
