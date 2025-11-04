import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TimerSnapshot } from "@/types/timer";

function snapshotsEqual(a: TimerSnapshot | null, b: TimerSnapshot | null) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  const stateA = a.state;
  const stateB = b.state;

  return (
    a.remaining_ms === b.remaining_ms &&
    stateA.status === stateB.status &&
    stateA.session_id === stateB.session_id &&
    stateA.target_ms === stateB.target_ms &&
    stateA.active_ms === stateB.active_ms &&
    stateA.started_at === stateB.started_at
  );
}

export function useTimerSnapshot() {
  const [timerState, setTimerState] = useState<TimerSnapshot | null>(null);
  const [error, setError] = useState<string>("");

  const applySnapshot = useCallback((snapshot: TimerSnapshot) => {
    setTimerState((prev) => {
      if (snapshotsEqual(prev, snapshot)) {
        return prev;
      }
      return snapshot;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchInitialState() {
      try {
        const snapshot = await invoke<TimerSnapshot>("get_timer_state");
        if (!cancelled) {
          applySnapshot(snapshot);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to get timer state: ${err}`);
        }
      }
    }

    fetchInitialState();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  useEffect(() => {
    const unlistenPromise = listen<TimerSnapshot>("timer-state-changed", (event) => {
      applySnapshot(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [applySnapshot]);

  useEffect(() => {
    const unlistenPromise = listen<TimerSnapshot>("timer-heartbeat", (event) => {
      applySnapshot(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [applySnapshot]);

  return { timerState, error, setError };
}
