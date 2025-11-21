import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTimerSnapshot } from "./useTimerSnapshot";
import type { SessionInfo, TimerMode } from "@/types/timer";

export function useTimer() {
  const { timerState, error, setError } = useTimerSnapshot();

  const startTimer = useCallback(async (durationMs: number, mode: TimerMode, labelId?: number | null) => {
    try {
      setError("");
      await invoke("start_timer", { targetMs: durationMs, mode, labelId });
    } catch (err) {
      setError(`Failed to start timer: ${err}`);
    }
  }, []);

  const endTimer = useCallback(async (): Promise<SessionInfo | null> => {
    try {
      setError("");
      const sessionInfo = await invoke<SessionInfo>("end_timer");
      return sessionInfo;
    } catch (err) {
      setError(`Failed to end timer: ${err}`);
      return null;
    }
  }, []);

  const cancelTimer = useCallback(async () => {
    try {
      setError("");
      await invoke("cancel_timer");
    } catch (err) {
      setError(`Failed to cancel timer: ${err}`);
    }
  }, []);

  return {
    timerState,
    error,
    startTimer,
    endTimer,
    cancelTimer,
  };
}
