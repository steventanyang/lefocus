import { useSmoothCountdown } from "@/hooks/useSmoothCountdown";
import type { TimerMode } from "@/types/timer";

interface TimerDisplayProps {
  remainingMs: number;
  isRunning: boolean;
  mode: TimerMode;
}

export function TimerDisplay({ remainingMs, isRunning, mode }: TimerDisplayProps) {
  const displayMs = useSmoothCountdown(remainingMs, isRunning, mode === "stopwatch");

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="text-[6rem] font-semibold leading-none text-center tracking-tight tabular-nums">
      {formatTime(displayMs)}
    </div>
  );
}
