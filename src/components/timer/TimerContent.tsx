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
  isLabelDropdownOpen?: boolean;
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
  isLabelDropdownOpen = false,
}: TimerContentProps) {
  return (
    <>
      {/* Clock and duration buttons grouped together to avoid parent gap-12 */}
      <div className="flex flex-col items-center w-full">
        <div className="flex items-center justify-center w-full mt-[30px]">
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
            isLabelDropdownOpen={isLabelDropdownOpen}
          />
        </div>

        {/* Duration buttons - reserve space to prevent clock shifting */}
        <div className="mt-[41px] h-[52px] flex items-center justify-center">
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
            <div aria-hidden="true" className="h-full" />
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
