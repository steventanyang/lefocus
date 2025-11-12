import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTimer } from "@/hooks/useTimer";
import { useEndTimerMutation } from "@/hooks/queries";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSessionCompleted } from "@/hooks/useSessionCompleted";
import { TimerContent } from "./TimerContent";
import { PRESETS } from "./DurationPicker";
import { BREAK_PRESETS } from "./BreakDurationPicker";
import { SessionResults } from "@/components/session/SessionResults";
import { KeyBox } from "@/components/ui/KeyBox";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { isUserTyping, isMac } from "@/utils/keyboardUtils";
import type { TimerMode } from "@/types/timer";
import {
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_BREAK_DURATION_MS,
  DEFAULT_STOPWATCH_DURATION_MS,
} from "@/constants/timer";

interface TimerViewProps {
  onNavigate: (view: "timer" | "activities" | "stats") => void;
}

export function TimerView({ onNavigate }: TimerViewProps) {
  const { timerState, error, startTimer, cancelTimer } = useTimer();
  const endTimerMutation = useEndTimerMutation();
  const completedSession = useSessionCompleted();

  const [selectedDuration, setSelectedDuration] = useState<number>(
    DEFAULT_COUNTDOWN_DURATION_MS
  );
  const [selectedBreakDuration, setSelectedBreakDuration] = useState<number>(
    DEFAULT_BREAK_DURATION_MS
  );
  const [selectedMode, setSelectedMode] = useState<TimerMode>("countdown");
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);

  // Handle mode switching: reset duration based on mode
  const handleModeChange = (mode: TimerMode) => {
    setSelectedMode(mode);
    if (mode === "stopwatch") {
      setSelectedDuration(DEFAULT_STOPWATCH_DURATION_MS);
    } else if (mode === "countdown") {
      setSelectedDuration(DEFAULT_COUNTDOWN_DURATION_MS);
    }
  };

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

  // Cycle through presets (left/right arrows)
  const cyclePreset = useCallback((direction: "left" | "right", event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (selectedMode === "countdown") {
      const currentDuration = selectedDuration || 0;
      // Find the closest preset to current duration
      let currentIndex = PRESETS.findIndex(
        (preset) => Math.abs(currentDuration - preset.ms) < 100
      );
      
      // If no exact match, find the closest preset
      if (currentIndex === -1) {
        let closestIndex = 0;
        let closestDiff = Math.abs(currentDuration - PRESETS[0].ms);
        for (let i = 1; i < PRESETS.length; i++) {
          const diff = Math.abs(currentDuration - PRESETS[i].ms);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestIndex = i;
          }
        }
        currentIndex = closestIndex;
      }
      
      // Cycle to next/previous preset
      const nextIndex = direction === "right" 
        ? (currentIndex + 1) % PRESETS.length
        : (currentIndex - 1 + PRESETS.length) % PRESETS.length;
      
      setSelectedDuration(PRESETS[nextIndex].ms);
    } else if (selectedMode === "break") {
      const currentDuration = selectedBreakDuration || 0;
      // Find the closest preset to current duration
      let currentIndex = BREAK_PRESETS.findIndex(
        (preset) => Math.abs(currentDuration - preset.ms) < 100
      );
      
      // If no exact match, find the closest preset
      if (currentIndex === -1) {
        let closestIndex = 0;
        let closestDiff = Math.abs(currentDuration - BREAK_PRESETS[0].ms);
        for (let i = 1; i < BREAK_PRESETS.length; i++) {
          const diff = Math.abs(currentDuration - BREAK_PRESETS[i].ms);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestIndex = i;
          }
        }
        currentIndex = closestIndex;
      }
      
      // Cycle to next/previous preset
      const nextIndex = direction === "right"
        ? (currentIndex + 1) % BREAK_PRESETS.length
        : (currentIndex - 1 + BREAK_PRESETS.length) % BREAK_PRESETS.length;
      
      setSelectedBreakDuration(BREAK_PRESETS[nextIndex].ms);
    }
  }, [selectedMode, selectedDuration, selectedBreakDuration]);

  // Adjust time by +/- 5 minutes (up/down arrows)
  const adjustTime = useCallback((direction: "up" | "down", event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const fiveMinutesMs = 5 * 60 * 1000;
    const adjustment = direction === "up" ? fiveMinutesMs : -fiveMinutesMs;
    
    if (selectedMode === "break") {
      const newDuration = Math.max(0, (selectedBreakDuration || 0) + adjustment);
      setSelectedBreakDuration(newDuration);
    } else if (selectedMode === "countdown") {
      const newDuration = Math.max(0, (selectedDuration || 0) + adjustment);
      setSelectedDuration(newDuration);
    }
  }, [selectedMode, selectedDuration, selectedBreakDuration]);

  // Calculate displayed session during render (no effect needed)
  // Show session if it exists and hasn't been dismissed
  const displayedSession = completedSession && completedSession.id !== dismissedSessionId 
    ? completedSession 
    : null;

  // Set up keyboard shortcuts (must be called unconditionally)
  useKeyboardShortcuts({
    onStart: handleStart,
    onSwitchMode: handleModeChange,
    isIdle,
    startDisabled,
  });

  // Handle keyboard shortcuts for arrow keys and h key
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
        return;
      }

      // Arrow key shortcuts (only when idle and not in stopwatch mode)
      if (isIdle && selectedMode !== "stopwatch") {
        // Left/Right arrows: Cycle through presets
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          cyclePreset("left");
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          cyclePreset("right");
          return;
        }

        // Up/Down arrows: Adjust time by ±5 minutes
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          adjustTime("up");
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          adjustTime("down");
          return;
        }
      }
    };

    // Use capture phase to catch events before they reach focused elements
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isIdle, selectedMode, cyclePreset, adjustTime]);

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
                onClick={() => handleModeChange("countdown")}
                className="text-base font-light text-gray-600 flex items-center gap-2"
              >
                <KeyBox selected={selectedMode === "countdown"}>T</KeyBox>
                <span className="nav-button-text">Timer</span>
              </button>
              <button
                onClick={() => handleModeChange("stopwatch")}
                className="text-base font-light text-gray-600 flex items-center gap-2"
              >
                <KeyBox selected={selectedMode === "stopwatch"}>S</KeyBox>
                <span className="nav-button-text">Stopwatch</span>
              </button>
              <button
                onClick={() => handleModeChange("break")}
                className="text-base font-light text-gray-600 flex items-center gap-2"
              >
                <KeyBox selected={selectedMode === "break"}>B</KeyBox>
                <span className="nav-button-text">Break</span>
              </button>
            </>
          )}
          {/* Navigation section - separated from timer modes */}
          <div className="flex flex-col gap-2 mt-4">
            <button
              className="text-base font-light text-gray-600 flex items-center gap-2"
              onClick={() => onNavigate("activities")}
            >
              <KeyboardShortcut keyLetter="a" />
              <span className="nav-button-text">Activities</span>
            </button>
            <button
              className="text-base font-light text-gray-600 flex items-center gap-2"
              onClick={() => onNavigate("stats")}
            >
              <KeyboardShortcut keyLetter="s" />
              <span className="nav-button-text">Stats</span>
            </button>
          </div>
        </div>
      </div>

      {/* General controls in bottom left */}
      <div
        className={`fixed bottom-8 left-8 flex flex-col gap-2 z-10 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          className="text-base font-light text-gray-600 flex items-center gap-2"
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
          className="text-base font-light text-gray-600 flex items-center gap-2"
          onClick={() => setControlsVisible(false)}
        >
          <KeyBox>H</KeyBox>
          <span className="nav-button-text">Hide</span>
        </button>
      </div>

      {/* Start button in bottom right */}
      {state.status === "idle" && (
        <div className="fixed bottom-8 right-8 z-10">
          <button
            onClick={handleStart}
            disabled={startDisabled}
            className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[120px] hover:bg-black hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black flex items-center gap-2 justify-center"
          >
            {/* Spacebar icon */}
            <svg width="20" height="8" viewBox="0 0 20 8" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-current mt-0.5">
              <path d="M2 1V5.5C2 6.5 2.5 7 4 7H16C17.5 7 18 6.5 18 5.5V1" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Start</span>
          </button>
        </div>
      )}

      <TimerContent
        remainingMs={remaining_ms}
        isRunning={isRunning}
        isIdle={isIdle}
        mode={state.mode}
        selectedMode={selectedMode}
        selectedDuration={selectedDuration}
        selectedBreakDuration={selectedBreakDuration}
        startDisabled={startDisabled}
        onTimeChange={(ms) => {
          if (selectedMode === "break") {
            setSelectedBreakDuration(ms);
          } else {
            setSelectedDuration(ms);
          }
        }}
        onDurationChange={setSelectedDuration}
        onBreakDurationChange={setSelectedBreakDuration}
        onStart={handleStart}
        onEnd={handleEnd}
        onCancel={cancelTimer}
      />

      {error && (
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {error}
        </div>
      )}
    </div>
  );
}
