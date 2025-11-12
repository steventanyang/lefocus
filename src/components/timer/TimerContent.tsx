import { TimerDisplay } from "./TimerDisplay";
import { TimerControls } from "./TimerControls";
import { DurationPicker } from "./DurationPicker";
import { BreakDurationPicker } from "./BreakDurationPicker";
import type { TimerMode } from "@/types/timer";

interface TimerContentProps {
  remainingMs: number;
  isRunning: boolean;
  isIdle: boolean;
  mode: TimerMode;
  selectedMode: TimerMode;
  selectedDuration: number;
  selectedBreakDuration: number;
  startDisabled: boolean;
  onTimeChange: (ms: number) => void;
  onDurationChange: (ms: number) => void;
  onBreakDurationChange: (ms: number) => void;
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  controlsVisible?: boolean;
}

export function TimerContent({
  remainingMs,
  isRunning,
  isIdle,
  mode,
  selectedMode,
  selectedDuration,
  selectedBreakDuration,
  startDisabled,
  onTimeChange,
  onDurationChange,
  onBreakDurationChange,
  onStart,
  onEnd,
  onCancel,
  controlsVisible = true,
}: TimerContentProps) {

  return (
    <>
      <div className="flex items-center justify-center w-full mt-8">
        <TimerDisplay
          remainingMs={remainingMs}
          isRunning={isRunning}
          mode={mode}
          isEditable={isIdle}
          onTimeChange={onTimeChange}
          initialMs={
            selectedMode === "break"
              ? selectedBreakDuration
              : selectedMode === "stopwatch"
              ? 0
              : selectedDuration
          }
        />
      </div>

      {/* Always reserve space to prevent clock shifting */}
      <div className="flex flex-col items-center w-full">
        <div className="mt-4 mb-4 min-h-[48px]">
          {isIdle && selectedMode === "countdown" && (
            <DurationPicker
              selectedDuration={selectedDuration}
              onSelect={onDurationChange}
            />
          )}
          {isIdle && selectedMode === "break" && (
            <BreakDurationPicker
              selectedDuration={selectedBreakDuration}
              onSelect={onBreakDurationChange}
            />
          )}
          {isIdle && selectedMode === "stopwatch" && (
            <div aria-hidden="true" />
          )}
        </div>
      </div>

      <TimerControls
        status={isIdle ? "idle" : isRunning ? "running" : "stopped"}
        mode={mode}
        onStart={onStart}
        onEnd={onEnd}
        onCancel={onCancel}
        startDisabled={startDisabled}
        controlsVisible={controlsVisible}
      />
    </>
  );
}

