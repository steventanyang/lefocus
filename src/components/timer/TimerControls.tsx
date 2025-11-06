import type { TimerStatus, TimerMode } from "@/types/timer";

interface TimerControlsProps {
  status: TimerStatus;
  mode: TimerMode;
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  startDisabled?: boolean;
}

export function TimerControls({
  status,
  mode,
  onStart,
  onEnd,
  onCancel,
  startDisabled = false,
}: TimerControlsProps) {
  const buttonClass = "bg-transparent border border-black text-black px-8 py-3.5 text-base font-normal cursor-pointer transition-all duration-200 min-w-[120px] hover:bg-black hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black";
  const primaryClass = `${buttonClass} font-semibold`;
  const secondaryClass = `${buttonClass} font-light`;

  if (status === "idle") {
    return (
      <div className="flex gap-4 justify-center">
        <button onClick={onStart} disabled={startDisabled} className={primaryClass}>
          Start
        </button>
      </div>
    );
  }

  if (status === "running") {
    // In stopwatch mode, show both End and Cancel buttons
    if (mode === "stopwatch") {
      return (
        <div className="flex gap-4 justify-center">
          <button onClick={onEnd} className={primaryClass}>
            End
          </button>
          <button onClick={onCancel} className={secondaryClass}>
            Cancel
          </button>
        </div>
      );
    }

    // In countdown mode, only show Cancel
    return (
      <div className="flex gap-4 justify-center">
        <button onClick={onCancel} className={secondaryClass}>
          Cancel
        </button>
      </div>
    );
  }

  if (status === "stopped") {
    return (
      <div className="flex gap-4 justify-center">
        <button onClick={onEnd} className={primaryClass}>
          End
        </button>
      </div>
    );
  }

  return null;
}
