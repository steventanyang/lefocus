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
      <div className="timer-view">
        <div className="loading">Loading timer...</div>
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
    <div className="timer-view">
      <h1>LeFocus</h1>

      <TimerDisplay remainingMs={remaining_ms} isRunning={isRunning} />

      {state.status === "idle" && (
        <div className="duration-section">
          <label>Duration</label>
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

      {error && <div className="error">{error}</div>}
    </div>
  );
}
