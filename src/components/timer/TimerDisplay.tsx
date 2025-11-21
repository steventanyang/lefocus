import { useState, useRef, useEffect } from "react";
import { useSmoothCountdown } from "@/hooks/useSmoothCountdown";
import { useTimerKeyboard } from "@/hooks/useTimerKeyboard";
import { TimerDisplayRenderer } from "./TimerDisplayRenderer";
import { msToMMSS, mmssToMs, formatTime, formatEditableTime } from "@/utils/timeUtils";
import type { TimerMode } from "@/types/timer";

interface TimerDisplayProps {
  remainingMs: number;
  isRunning: boolean;
  mode: TimerMode;
  isEditable?: boolean;
  onTimeChange?: (ms: number) => void;
  initialMs?: number;
  isLabelDropdownOpen?: boolean;
}

export function TimerDisplay({
  remainingMs,
  isRunning,
  mode,
  isEditable = false,
  onTimeChange,
  initialMs,
  isLabelDropdownOpen = false,
}: TimerDisplayProps) {
  const displayMs = useSmoothCountdown(remainingMs, isRunning, mode === "stopwatch");
  // Initialize editableValue from initialMs if provided and editable
  const [editableValue, setEditableValue] = useState<number>(() => {
    if (isEditable && initialMs !== undefined) {
      return msToMMSS(initialMs);
    }
    return 0;
  });
  const displayRef = useRef<HTMLDivElement>(null);
  const lastSentMsRef = useRef<number | null>(null);
  // Initialize to undefined so first effect run detects initialMs as a change
  const lastExternalInitialMsRef = useRef<number | undefined>(undefined);

  const { handleKeyDown } = useTimerKeyboard({
    isEditable,
    editableValue,
    setEditableValue,
    onTimeChange,
    displayRef,
    lastSentMsRef,
    isLabelDropdownOpen,
  });

  // Sync editableValue with external initialMs changes
  // This synchronizes with external system (parent component state)
  // Only sync when it's a real external change (not our own update via onTimeChange)
  useEffect(() => {
    if (isEditable && initialMs !== undefined) {
      // Check if this is a real external change (not our own update)
      const isExternalChange = 
        lastExternalInitialMsRef.current !== initialMs &&
        (lastSentMsRef.current === null || Math.abs(lastSentMsRef.current - initialMs) >= 100);
      
      if (isExternalChange) {
        // This is an external change (e.g., preset button clicked), sync it
        setEditableValue(msToMMSS(initialMs));
        lastSentMsRef.current = null; // Reset after syncing external change
      }
      lastExternalInitialMsRef.current = initialMs;
    } else if (!isEditable) {
      // Reset ref when not editable
      lastExternalInitialMsRef.current = undefined;
    }
  }, [isEditable, initialMs]);


  const handleClick = () => {
    if (isEditable && displayRef.current) {
      displayRef.current.focus();
    }
  };

  const handleBlur = () => {
    // When editing is complete, update the parent with the final value
    if (onTimeChange && isEditable) {
      const msValue = mmssToMs(editableValue);
      lastSentMsRef.current = msValue;
      onTimeChange(msValue);
    }
  };

  if (isEditable) {
    const timeStr = formatEditableTime(editableValue);
    return (
      <div
        ref={displayRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onBlur={handleBlur}
        className="text-[5rem] font-semibold leading-none text-center tracking-tight tabular-nums cursor-text outline-none focus:outline-none text-black"
      >
        <TimerDisplayRenderer timeStr={timeStr} editableValueForColon={editableValue} />
      </div>
    );
  }

  const timeStr = formatTime(displayMs);
  // When running, hide leading zeros:
  // - Hide "00:" when < 1 minute (show only seconds)
  // - Hide leading zero in minutes when >= 1 minute (e.g., "2:46" instead of "02:46")
  const hideLeadingZeros = isRunning;
  return (
    <div className="text-[5rem] font-semibold leading-none text-center tracking-tight tabular-nums text-black">
      <TimerDisplayRenderer timeStr={timeStr} hideLeadingZerosWhenRunning={hideLeadingZeros} />
    </div>
  );
}
