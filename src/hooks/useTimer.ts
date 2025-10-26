import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTimerSnapshot } from "./useTimerSnapshot";

export function useTimer() {
  const { timerState, error, setError } = useTimerSnapshot();

  const startTimer = useCallback(async (durationMs: number) => {
    try {
      setError("");
      await invoke("start_timer", { targetMs: durationMs });
    } catch (err) {
      setError(`Failed to start timer: ${err}`);
    }
  }, []);

  const endTimer = useCallback(async () => {
    try {
      setError("");
      await invoke("end_timer");
    } catch (err) {
      setError(`Failed to end timer: ${err}`);
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
