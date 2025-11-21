import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTimer } from "@/hooks/useTimer";
import { useEndTimerMutation } from "@/hooks/queries";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSessionCompleted } from "@/hooks/useSessionCompleted";
import { useLabels, useLabelById } from "@/hooks/useLabels";
import { TimerContent } from "./TimerContent";
import { PRESETS } from "./DurationPicker";
import { BREAK_PRESETS } from "./BreakDurationPicker";
import { SessionResults } from "@/components/session/SessionResults";
import { KeyBox } from "@/components/ui/KeyBox";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { LabelTag } from "@/components/labels/LabelTag";
import { LabelDropdown } from "@/components/labels/LabelDropdown";
import { LabelModal } from "@/components/labels/LabelModal";
import { isUserTyping, isMac } from "@/utils/keyboardUtils";
import type { TimerMode } from "@/types/timer";
import {
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_BREAK_DURATION_MS,
  DEFAULT_STOPWATCH_DURATION_MS,
} from "@/constants/timer";

interface TimerViewProps {
  onNavigate: (view: "timer" | "activities" | "stats" | "profile") => void;
}

export function TimerView({ onNavigate }: TimerViewProps) {
  const { timerState, error, startTimer, cancelTimer } = useTimer();
  const endTimerMutation = useEndTimerMutation();
  const completedSession = useSessionCompleted();
  const { labels, lastUsedLabelId, setLastUsedLabelId } = useLabels();

  const [selectedDuration, setSelectedDuration] = useState<number>(
    DEFAULT_COUNTDOWN_DURATION_MS
  );
  const [selectedBreakDuration, setSelectedBreakDuration] = useState<number>(
    DEFAULT_BREAK_DURATION_MS
  );
  const [selectedMode, setSelectedMode] = useState<TimerMode>("countdown");
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);

  // Label state
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(lastUsedLabelId);
  const [isLabelDropdownOpen, setIsLabelDropdownOpen] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);

  // Update selectedLabelId when lastUsedLabelId changes
  useEffect(() => {
    setSelectedLabelId(lastUsedLabelId);
  }, [lastUsedLabelId]);

  const selectedLabel = useLabelById(selectedLabelId, labels);

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
      // Pass labelId when starting timer (only for non-break sessions)
      const labelIdToPass = selectedMode === "break" ? null : selectedLabelId;
      startTimer(duration, selectedMode, labelIdToPass);
      // Update lastUsedLabelId for next session
      if (selectedMode !== "break" && selectedLabelId !== null) {
        setLastUsedLabelId(selectedLabelId);
      }
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
    // Maximum duration for countdown/break: 3 hours (3:00:00)
    const maxDurationMs = 3 * 60 * 60 * 1000; // 10800000ms = 3 hours
    const adjustment = direction === "up" ? fiveMinutesMs : -fiveMinutesMs;
    
    if (selectedMode === "break") {
      let newDuration = (selectedBreakDuration || 0) + adjustment;
      if (newDuration < 0) {
        newDuration = 0;
      } else if (newDuration > maxDurationMs) {
        newDuration = 0; // Wrap to 00:00 when exceeding 3 hours
      }
      setSelectedBreakDuration(newDuration);
    } else if (selectedMode === "countdown") {
      let newDuration = (selectedDuration || 0) + adjustment;
      if (newDuration < 0) {
        newDuration = 0;
      } else if (newDuration > maxDurationMs) {
        newDuration = 0; // Wrap to 00:00 when exceeding 3 hours
      }
      setSelectedDuration(newDuration);
    }
    // Stopwatch mode doesn't use adjustTime - it starts at 0 and can run up to 99:59:59
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
    isSessionResultsDisplayed: !!displayedSession,
    isModalOpen: isLabelModalOpen,
  });

  // Handle keyboard shortcuts for arrow keys and h key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      // Don't handle keyboard shortcuts when SessionResults is displayed
      // Let SessionResults handle its own keyboard navigation
      const hasDisplayedSession = completedSession && completedSession.id !== dismissedSessionId;
      if (hasDisplayedSession) {
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

      // L key: Open label dropdown (only when idle)
      if ((event.key === "l" || event.key === "L") && isIdle) {
        const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;
        if (!isModifierPressed) {
          event.preventDefault();
          setIsLabelDropdownOpen((prev) => !prev);
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
  }, [isIdle, selectedMode, cyclePreset, adjustTime, completedSession, dismissedSessionId]);

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
      {/* Label section in top right */}
      {state.status === "idle" && (
        <div
          className={`fixed top-8 right-8 z-10 transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="flex flex-col items-end gap-2 relative">
            <button
              onClick={() => setIsLabelDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 group"
            >
              <KeyBox hovered={false}>L</KeyBox>
              <LabelTag label={selectedLabel} />
            </button>
            <LabelDropdown
              isOpen={isLabelDropdownOpen}
              onClose={() => setIsLabelDropdownOpen(false)}
              labels={labels}
              currentLabelId={selectedLabelId}
              onSelectLabel={(labelId) => {
                setSelectedLabelId(labelId);
                if (labelId !== null) {
                  setLastUsedLabelId(labelId);
                }
                setIsLabelDropdownOpen(false);
              }}
              onAddNew={() => {
                setIsLabelDropdownOpen(false);
                setIsLabelModalOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Label Modal */}
      <LabelModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        mode="create"
        autoAssignToSessionId={undefined}
        existingLabels={labels}
        onLabelCreated={(labelId) => {
          setSelectedLabelId(labelId);
          setLastUsedLabelId(labelId);
        }}
      />

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
                className="text-base font-light text-gray-600 dark:text-stone-400 flex items-center gap-2 group"
              >
                <KeyBox selected={selectedMode === "countdown"} hovered={false}>T</KeyBox>
                <span className="group-hover:text-black dark:group-hover:text-stone-50 transition-colors duration-200 group-hover:transition-none">Timer</span>
              </button>
              <button
                onClick={() => handleModeChange("stopwatch")}
                className="text-base font-light text-gray-600 dark:text-stone-400 flex items-center gap-2 group"
              >
                <KeyBox selected={selectedMode === "stopwatch"} hovered={false}>S</KeyBox>
                <span className="group-hover:text-black dark:group-hover:text-stone-50 transition-colors duration-200 group-hover:transition-none">Stopwatch</span>
              </button>
              <button
                onClick={() => handleModeChange("break")}
                className="text-base font-light text-gray-600 dark:text-stone-400 flex items-center gap-2 group"
              >
                <KeyBox selected={selectedMode === "break"} hovered={false}>B</KeyBox>
                <span className="group-hover:text-black dark:group-hover:text-stone-50 transition-colors duration-200 group-hover:transition-none">Break</span>
              </button>
            </>
          )}
          {/* Navigation section - separated from timer modes */}
          <div className="flex flex-col gap-2 mt-4">
            <button
              className="text-base font-light text-gray-600 flex items-center gap-2 group"
              onClick={() => onNavigate("activities")}
            >
              <KeyboardShortcut keyLetter="a" hovered={false} />
              <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Activities</span>
            </button>
            <button
              className="text-base font-light text-gray-600 flex items-center gap-2 group"
              onClick={() => onNavigate("stats")}
            >
              <KeyboardShortcut keyLetter="s" hovered={false} />
              <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Stats</span>
            </button>
            <button
              className="text-base font-light text-gray-600 flex items-center gap-2 group"
              onClick={() => onNavigate("profile")}
            >
              <KeyboardShortcut keyLetter="p" hovered={false} />
              <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Profile</span>
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
          className="text-base font-light text-gray-600 flex items-center gap-2 group"
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
          <KeyboardShortcut keyLetter="f" hovered={false} />
          <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Fullscreen</span>
        </button>
        <button
          className="text-base font-light text-gray-600 flex items-center gap-2 group"
          onClick={() => setControlsVisible(false)}
        >
          <KeyBox hovered={false}>H</KeyBox>
          <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Hide</span>
        </button>
      </div>

      {/* Start button in bottom right */}
      {state.status === "idle" && (
        <div className="fixed bottom-8 right-8 flex flex-col items-start gap-2 z-10">
          <div className={`transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
            <KeyBox className="w-16 h-6 px-2 py-1">return</KeyBox>
          </div>
          <button
            onClick={handleStart}
            disabled={startDisabled}
            className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer w-[160px] hover:bg-black hover:text-white hover:transition-none transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black"
          >
            Start
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
        controlsVisible={controlsVisible}
        isLabelDropdownOpen={isLabelDropdownOpen}
      />

      {error && (
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {error}
        </div>
      )}
    </div>
  );
}
