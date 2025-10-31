import { useState } from "react";
import { useTimer } from "../hooks/useTimer";
import { TimerDisplay } from "./TimerDisplay";
import { TimerControls } from "./TimerControls";
import { DurationPicker } from "./DurationPicker";
import { SessionResults } from "./SessionResults";

export function TimerView() {
  const { timerState, error, startTimer, endTimer, cancelTimer } = useTimer();
  const [selectedDuration, setSelectedDuration] = useState<number>(
    25 * 60 * 1000
  ); // Default 25 min
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(
    null
  );

  if (!timerState) {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-12">
        <div className="text-base font-light text-center p-8">Loading timer...</div>
      </div>
    );
  }

  // Show session results if we have a completed session
  if (completedSessionId) {
    return (
      <SessionResults
        sessionId={completedSessionId}
        onBack={() => setCompletedSessionId(null)}
      />
    );
  }

  const { state, remaining_ms } = timerState;
  const isRunning = state.status === "running";

  const handleStart = () => {
    startTimer(selectedDuration);
  };

  const handleEnd = async () => {
    const sessionInfo = await endTimer();
    if (sessionInfo) {
      setCompletedSessionId(sessionInfo.id);
    }
  };

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-12">
      <h1 className="text-2xl font-light tracking-wide text-center">LeFocus</h1>

      <TimerDisplay remainingMs={remaining_ms} isRunning={isRunning} />

      {state.status === "idle" && (
        <div className="flex flex-col gap-4 items-center w-full">
          <label className="text-sm font-light tracking-wide uppercase">Duration</label>
          <DurationPicker
            selectedDuration={selectedDuration}
            onSelect={setSelectedDuration}
          />
        </div>
      )}

      <TimerControls
        status={state.status}
        onStart={handleStart}
        onEnd={handleEnd}
        onCancel={cancelTimer}
        startDisabled={selectedDuration === null}
      />

      {error && (
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {error}
        </div>
      )}
    </div>
  );
}
