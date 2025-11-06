import { useEffect, useRef, useState } from "react";

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function useSmoothCountdown(
  remainingMs: number,
  isRunning: boolean,
  countUp: boolean = false
) {
  const [displayMs, setDisplayMs] = useState(remainingMs);
  const lastSyncRef = useRef({
    remainingMs,
    timestamp: now(),
  });
  const prevIsRunningRef = useRef(isRunning);

  useEffect(() => {
    // Reset sync ref when remainingMs changes from server
    lastSyncRef.current = {
      remainingMs,
      timestamp: now(),
    };
    setDisplayMs(remainingMs);
  }, [remainingMs]);

  // Detect when timer transitions from stopped to running - force reset
  useEffect(() => {
    if (!prevIsRunningRef.current && isRunning) {
      // Timer just started - force reset to current remainingMs
      lastSyncRef.current = {
        remainingMs,
        timestamp: now(),
      };
      setDisplayMs(remainingMs);
    }
    prevIsRunningRef.current = isRunning;
  }, [isRunning, remainingMs]);

  useEffect(() => {
    if (!isRunning) {
      // Reset display to the actual remaining_ms when stopped
      setDisplayMs(remainingMs);
      return;
    }

    let frame: number | null = null;

    const tick = () => {
      const elapsed = now() - lastSyncRef.current.timestamp;
      const derived = countUp
        ? lastSyncRef.current.remainingMs + elapsed // Count up for stopwatch
        : Math.max(0, lastSyncRef.current.remainingMs - elapsed); // Count down for timer
      setDisplayMs(derived);
      if (!countUp && derived <= 0) {
        // Stop animation when countdown reaches 0
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [isRunning, countUp, remainingMs]);

  return displayMs;
}
