import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTimer } from "@/hooks/useTimer";
import { useEndTimerMutation } from "@/hooks/queries";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { TimerDisplay } from "./TimerDisplay";
import { TimerControls } from "./TimerControls";
import { DurationPicker } from "./DurationPicker";
import { SessionResults } from "@/components/session/SessionResults";
import { KeyBox } from "@/components/ui/KeyBox";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import type { SessionInfo, TimerMode } from "@/types/timer";
import { useQueryClient } from "@tanstack/react-query";

type SessionCompletedPayload = {
  session_id: string;
  session: SessionInfo;
};

interface TimerViewProps {
  onNavigate: (view: "timer" | "activities") => void;
}

export function TimerView({ onNavigate }: TimerViewProps) {
  const { timerState, error, startTimer, cancelTimer } = useTimer();
  const endTimerMutation = useEndTimerMutation();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    const unlistenPromise = listen<SessionCompletedPayload>(
      "session-completed",
      (event) => {
        setCompletedSession(event.payload.session);
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
      }
    );

    return () => {
      unlistenPromise
        .then((unlisten) => unlisten())
        .catch(() => {
          /* ignore */
        });
    };
  }, [queryClient]);

  // Set up keyboard shortcuts (must be called unconditionally)
  useKeyboardShortcuts({
    onStart: handleStart,
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
      {/* Navigation buttons in top left */}
      <div className="fixed top-8 left-8 flex flex-col gap-2 z-10">
        {state.status === "idle" && (
          <>
            <button
              onClick={() => setSelectedMode("countdown")}
              className={`text-sm font-light flex items-center gap-2 ${
                selectedMode === "countdown" ? "opacity-100" : "opacity-60"
              }`}
            >
              <KeyBox selected={selectedMode === "countdown"}>T</KeyBox>
              <span className="nav-button-text">Timer</span>
            </button>
            <button
              onClick={() => setSelectedMode("stopwatch")}
              className={`text-sm font-light flex items-center gap-2 ${
                selectedMode === "stopwatch" ? "opacity-100" : "opacity-60"
              }`}
            >
              <KeyBox selected={selectedMode === "stopwatch"}>S</KeyBox>
              <span className="nav-button-text">Stopwatch</span>
            </button>
          </>
        )}
        <button
          className="text-sm font-light flex items-center gap-2"
          onClick={() => onNavigate("activities")}
        >
          <KeyboardShortcut keyLetter="a" />
          <span className="nav-button-text">Activities</span>
        </button>
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
