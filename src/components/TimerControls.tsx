import type { TimerStatus } from "../types/timer";

interface TimerControlsProps {
  status: TimerStatus;
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  startDisabled?: boolean;
}

export function TimerControls({
  status,
  onStart,
  onEnd,
  onCancel,
  startDisabled = false,
}: TimerControlsProps) {
  if (status === "idle") {
    return (
      <div className="timer-controls">
        <button onClick={onStart} disabled={startDisabled} className="primary">
          Start
        </button>
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="timer-controls">
        <button onClick={onCancel} className="secondary">
          Cancel
        </button>
      </div>
    );
  }

  if (status === "stopped") {
    return (
      <div className="timer-controls">
        <button onClick={onEnd} className="primary">
          End
        </button>
      </div>
    );
  }

  return null;
}
