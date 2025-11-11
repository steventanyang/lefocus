import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTimer } from "@/hooks/useTimer";
import { useEndTimerMutation } from "@/hooks/queries";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSessionCompleted } from "@/hooks/useSessionCompleted";
import { TimerDisplay } from "./TimerDisplay";
import { TimerControls } from "./TimerControls";
import { DurationPicker } from "./DurationPicker";
import { BreakDurationPicker } from "./BreakDurationPicker";
import { SessionResults } from "@/components/session/SessionResults";
import { KeyBox } from "@/components/ui/KeyBox";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { isUserTyping, isMac } from "@/utils/keyboardUtils";
import type { TimerMode } from "@/types/timer";

interface TimerViewProps {
  onNavigate: (view: "timer" | "activities" | "stats") => void;
}

export function TimerView({ onNavigate }: TimerViewProps) {
  const { timerState, error, startTimer, cancelTimer } = useTimer();
  const endTimerMutation = useEndTimerMutation();
  const completedSession = useSessionCompleted();

  const [selectedDuration, setSelectedDuration] = useState<number>(
    25 * 60 * 1000
  ); // Default 25 min
  const [selectedBreakDuration, setSelectedBreakDuration] = useState<number>(
    5 * 60 * 1000
  ); // Default 5 min for break
  const [selectedMode, setSelectedMode] = useState<TimerMode>("countdown");
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);

  // Calculate state-dependent values (handle null case)
  const isIdle = timerState?.state.status === "idle" || false;
  const startDisabled =
    (selectedMode === "countdown" && (selectedDuration === null || selectedDuration === 0)) ||
    (selectedMode === "break" && (selectedBreakDuration === null || selectedBreakDuration === 0));

  const handleStart = () => {
    if (timerState) {
      const duration = selectedMode === "break" ? selectedBreakDuration : selectedDuration;
      startTimer(duration, selectedMode);
    }
  };

  // Calculate displayed session during render (no effect needed)
  // Show session if it exists and hasn't been dismissed
  const displayedSession = completedSession && completedSession.id !== dismissedSessionId 
    ? completedSession 
    : null;

  // Set up keyboard shortcuts (must be called unconditionally)
  useKeyboardShortcuts({
    onStart: handleStart,
    onSwitchMode: setSelectedMode,
    isIdle,
    startDisabled,
  });

  // Handle h key to toggle controls visibility
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      // H key: Toggle controls visibility
      if (event.key === "h" || event.key === "H") {
        const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;
        // Only toggle if no modifier is pressed (just H, not Cmd+H)
        if (!isModifierPressed) {
          event.preventDefault();
          setControlsVisible((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!timerState) {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-12">
        <div className="text-base font-light text-center p-8">
          Loading timer...
        </div>
      </div>
    );
  }

  // Show session results if we have a displayed session
  if (displayedSession) {
    return (
      <SessionResults
        sessionId={displayedSession.id}
        session={displayedSession}
        onBack={() => setDismissedSessionId(displayedSession.id)}
      />
    );
  }

  const { state, remaining_ms } = timerState;
  const isRunning = state.status === "running";

  const handleEnd = async () => {
    // For break mode, just end the timer without showing results
    if (state.mode === "break") {
      await endTimerMutation.mutateAsync();
      return;
    }
    
    // Use mutation to end timer - automatically invalidates sessions cache
    // The session will be displayed via useSessionCompleted hook
    await endTimerMutation.mutateAsync();
  };

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-12">
      {/* Navigation buttons in top left */}
      <div
        className={`fixed top-8 left-8 flex flex-col gap-4 z-10 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Main navigation block */}
        <div className="flex flex-col gap-2">
          {state.status === "idle" && (
            <>
              <button
                onClick={() => setSelectedMode("countdown")}
                className="text-base font-light flex items-center gap-2"
              >
                <KeyBox selected={selectedMode === "countdown"}>T</KeyBox>
                <span className="nav-button-text">Timer</span>
              </button>
              <button
                onClick={() => setSelectedMode("stopwatch")}
                className="text-base font-light flex items-center gap-2"
              >
                <KeyBox selected={selectedMode === "stopwatch"}>S</KeyBox>
                <span className="nav-button-text">Stopwatch</span>
              </button>
              <button
                onClick={() => setSelectedMode("break")}
                className="text-base font-light flex items-center gap-2"
              >
                <KeyBox selected={selectedMode === "break"}>B</KeyBox>
                <span className="nav-button-text">Break</span>
              </button>
            </>
          )}
          <button
            className="text-base font-light flex items-center gap-2"
            onClick={() => onNavigate("activities")}
          >
            <KeyboardShortcut keyLetter="a" />
            <span className="nav-button-text">Activities</span>
          </button>
          <button
            className="text-base font-light flex items-center gap-2"
            onClick={() => onNavigate("stats")}
          >
            <KeyboardShortcut keyLetter="s" />
            <span className="nav-button-text">Stats</span>
          </button>
        </div>
      </div>

      {/* General controls in bottom left */}
      <div
        className={`fixed bottom-8 left-8 flex flex-col gap-2 z-10 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          className="text-base font-light flex items-center gap-2"
          onClick={async () => {
            try {
              const window = getCurrentWindow();
              const isFullscreen = await window.isFullscreen();
              await window.setFullscreen(!isFullscreen);
            } catch (err) {
              console.error("Failed to toggle fullscreen:", err);
            }
          }}
        >
          <KeyboardShortcut keyLetter="f" />
          <span className="nav-button-text">Fullscreen</span>
        </button>
        <button
          className="text-base font-light flex items-center gap-2"
          onClick={() => setControlsVisible(false)}
        >
          <KeyBox>H</KeyBox>
          <span className="nav-button-text">Hide</span>
        </button>
      </div>

      <TimerDisplay
        remainingMs={remaining_ms}
        isRunning={isRunning}
        mode={state.mode}
        isEditable={state.status === "idle"}
        onTimeChange={(ms) => {
          if (selectedMode === "break") {
            setSelectedBreakDuration(ms);
          } else {
            setSelectedDuration(ms);
          }
        }}
        initialMs={selectedMode === "break" ? selectedBreakDuration : selectedDuration}
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

      {state.status === "idle" && selectedMode === "break" && (
        <div className="flex flex-col gap-4 items-center w-full">
          <label className="text-sm font-light tracking-wide uppercase">
            Duration
          </label>
          <BreakDurationPicker
            selectedDuration={selectedBreakDuration}
            onSelect={setSelectedBreakDuration}
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
