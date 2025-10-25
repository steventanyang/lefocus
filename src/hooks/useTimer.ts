import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TimerSnapshot } from "../types/timer";

export function useTimer() {
  const [timerState, setTimerState] = useState<TimerSnapshot | null>(null);
  const [error, setError] = useState<string>("");

  // Fetch initial timer state on mount
  useEffect(() => {
    async function fetchInitialState() {
      try {
        const snapshot = await invoke<TimerSnapshot>("get_timer_state");
        setTimerState(snapshot);
      } catch (err) {
        setError(`Failed to get timer state: ${err}`);
      }
    }
    fetchInitialState();
  }, []);

  // Listen to timer state changes
  useEffect(() => {
    const unlistenPromise = listen<TimerSnapshot>("timer-state-changed", (event) => {
      setTimerState(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Listen to heartbeat events (for DB sync updates)
  useEffect(() => {
    const unlistenPromise = listen<TimerSnapshot>("timer-heartbeat", (event) => {
      setTimerState(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

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
