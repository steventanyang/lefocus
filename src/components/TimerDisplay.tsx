import { useState, useEffect } from "react";

interface TimerDisplayProps {
  remainingMs: number;
  isRunning: boolean;
}

export function TimerDisplay({ remainingMs, isRunning }: TimerDisplayProps) {
  const [displayMs, setDisplayMs] = useState(remainingMs);

  // Local 250ms animation interval for smooth countdown
  useEffect(() => {
    setDisplayMs(remainingMs);

    if (!isRunning) {
      return;
    }

    const interval = setInterval(() => {
      setDisplayMs((prev) => Math.max(0, prev - 250));
    }, 250);

    return () => clearInterval(interval);
  }, [remainingMs, isRunning]);

  // Format milliseconds to MM:SS
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="timer-display">
      {formatTime(displayMs)}
    </div>
  );
}
