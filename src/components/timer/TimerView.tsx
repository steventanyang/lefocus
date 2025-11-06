import { useState } from "react";
import { useTimer } from "@/hooks/useTimer";
import { useEndTimerMutation } from "@/hooks/queries";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { TimerDisplay } from "./TimerDisplay";
import { TimerControls } from "./TimerControls";
import { DurationPicker } from "./DurationPicker";
import { SessionResults } from "@/components/session/SessionResults";
import type { SessionInfo, TimerMode } from "@/types/timer";

interface TimerViewProps {
  onNavigate: (view: "timer" | "activities") => void;
}

export function TimerView({ onNavigate }: TimerViewProps) {
  const { timerState, error, startTimer, cancelTimer } = useTimer();
  const endTimerMutation = useEndTimerMutation();

  const [selectedDuration, setSelectedDuration] = useState<number>(
    25 * 60 * 1000
  ); // Default 25 min
  const [selectedMode, setSelectedMode] = useState<TimerMode>("countdown");
  const [completedSession, setCompletedSession] = useState<SessionInfo | null>(
    null
  );

  // Calculate state-dependent values (handle null case)
  const isIdle = timerState?.state.status === "idle" || false;
  const startDisabled =
    selectedMode === "countdown" && selectedDuration === null;

  const handleStart = () => {
    if (timerState) {
      startTimer(selectedDuration, selectedMode);
    }
  };

  // Set up keyboard shortcuts (must be called unconditionally)
  useKeyboardShortcuts({
    onStart: handleStart,
    onNavigateActivities: () => onNavigate("activities"),
    onSwitchMode: setSelectedMode,
    isIdle,
    startDisabled,
  });

  if (!timerState) {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-12">
        <div className="text-base font-light text-center p-8">
          Loading timer...
        </div>
      </div>
    );
  }

  // Show session results if we have a completed session
  if (completedSession) {
    return (
      <SessionResults
        sessionId={completedSession.id}
        session={completedSession}
        onBack={() => setCompletedSession(null)}
      />
    );
  }

  const { state, remaining_ms } = timerState;
  const isRunning = state.status === "running";

  const handleEnd = async () => {
    // Use mutation to end timer - automatically invalidates sessions cache
    const sessionInfo = await endTimerMutation.mutateAsync();
    if (sessionInfo) {
      setCompletedSession(sessionInfo);
    }
  };

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-12">
      <div className="w-full flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">LeFocus</h1>
        <div className="flex gap-2">
          {state.status === "idle" && (
            <>
              <button
                onClick={() => setSelectedMode("countdown")}
                className={
                  selectedMode === "countdown"
                    ? "text-sm font-semibold border border-black px-3 py-1 bg-black text-white transition-colors"
                    : "text-sm font-light border border-black px-3 py-1 hover:bg-black hover:text-white transition-colors"
                }
              >
                Timer
              </button>
              <button
                onClick={() => setSelectedMode("stopwatch")}
                className={
                  selectedMode === "stopwatch"
                    ? "text-sm font-semibold border border-black px-3 py-1 bg-black text-white transition-colors"
                    : "text-sm font-light border border-black px-3 py-1 hover:bg-black hover:text-white transition-colors"
                }
              >
                Stopwatch
              </button>
            </>
          )}
          <button
            className="text-sm font-light border border-black px-3 py-1 hover:bg-black hover:text-white transition-colors"
            onClick={() => onNavigate("activities")}
          >
            Activities
          </button>
        </div>
      </div>

      <TimerDisplay
        remainingMs={remaining_ms}
        isRunning={isRunning}
        mode={state.mode}
      />

      {state.status === "idle" && selectedMode === "countdown" && (
        <div className="flex flex-col gap-4 items-center w-full">
          <label className="text-sm font-light tracking-wide uppercase">
            Duration
          </label>
          <DurationPicker
            selectedDuration={selectedDuration}
            onSelect={setSelectedDuration}
          />
        </div>
      )}

      <TimerControls
        status={state.status}
        mode={state.mode}
        onStart={handleStart}
        onEnd={handleEnd}
        onCancel={cancelTimer}
        startDisabled={startDisabled}
      />

      {error && (
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {error}
        </div>
      )}
    </div>
  );
}
