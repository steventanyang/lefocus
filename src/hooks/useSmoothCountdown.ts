import { useEffect, useRef, useState } from "react";

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function useSmoothCountdown(remainingMs: number, isRunning: boolean) {
  const [displayMs, setDisplayMs] = useState(remainingMs);
  const lastSyncRef = useRef({
    remainingMs,
    timestamp: now(),
  });

  useEffect(() => {
    lastSyncRef.current = {
      remainingMs,
      timestamp: now(),
    };
    setDisplayMs(remainingMs);
  }, [remainingMs]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    let frame: number | null = null;

    const tick = () => {
      const elapsed = now() - lastSyncRef.current.timestamp;
      const derived = Math.max(0, lastSyncRef.current.remainingMs - elapsed);
      setDisplayMs(derived);
      if (derived > 0) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [isRunning]);

  return displayMs;
}
