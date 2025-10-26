import { useSmoothCountdown } from "../hooks/useSmoothCountdown";

interface TimerDisplayProps {
  remainingMs: number;
  isRunning: boolean;
}

export function TimerDisplay({ remainingMs, isRunning }: TimerDisplayProps) {
  const displayMs = useSmoothCountdown(remainingMs, isRunning);

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
