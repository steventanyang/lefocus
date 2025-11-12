/**
 * Timer-related constants
 */

// Default durations in milliseconds
export const DEFAULT_COUNTDOWN_DURATION_MS = 25 * 60 * 1000; // 25 minutes
export const DEFAULT_BREAK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_STOPWATCH_DURATION_MS = 0; // Stopwatch starts at 0

// Duration presets (in milliseconds)
export const TIMER_PRESETS_MS = {
  POMODORO: 25 * 60 * 1000, // 25 minutes
  SHORT_BREAK: 5 * 60 * 1000, // 5 minutes
  LONG_BREAK: 15 * 60 * 1000, // 15 minutes
  FOCUS_30: 30 * 60 * 1000, // 30 minutes
  FOCUS_45: 45 * 60 * 1000, // 45 minutes
  FOCUS_60: 60 * 60 * 1000, // 60 minutes
} as const;

