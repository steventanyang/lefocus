import { useEffect, useRef, useState } from "react";
import { useSmoothCountdown } from "@/hooks/useSmoothCountdown";
import { useTimerKeyboard } from "@/hooks/useTimerKeyboard";
import { MAX_TIMER_DURATION_MS } from "@/constants/timer";
import { TimerDisplayRenderer } from "./TimerDisplayRenderer";
import { clockDigitsToMs, formatTime, msToClockDigits } from "@/utils/timeUtils";
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
  initialMs = 0,
  isLabelDropdownOpen = false,
}: TimerDisplayProps) {
  const displayMs = useSmoothCountdown(remainingMs, isRunning, mode === "stopwatch");
  const [editableDigits, setEditableDigits] = useState(() => msToClockDigits(initialMs));
  const [isEditing, setIsEditing] = useState(false);
  const displayRef = useRef<HTMLDivElement>(null);
  const editableDigitsRef = useRef(editableDigits);
  const lastSentMsRef = useRef<number | null>(null);
  const lastExternalInitialMsRef = useRef<number | undefined>(initialMs);
  const currentMsRef = useRef(initialMs);
  const isEditingRef = useRef(false);
  const editBaselineMsRef = useRef(initialMs);

  const { handleKeyDown, finishEditing } = useTimerKeyboard({
    isEditable,
    setEditableDigits,
    editableDigitsRef,
    onTimeChange,
    displayRef,
    lastSentMsRef,
    currentMsRef,
    isEditingRef,
    editBaselineMsRef,
    maxDurationMs: MAX_TIMER_DURATION_MS,
    isLabelDropdownOpen,
    onEditingChange: setIsEditing,
  });

  // Parent updates caused by typing should preserve the user's raw digit buffer.
  // Presets, arrow shortcuts, and mode changes replace it with a canonical value.
  useEffect(() => {
    if (!isEditable) {
      lastExternalInitialMsRef.current = undefined;
      isEditingRef.current = false;
      setIsEditing(false);
      return;
    }

    const wasSentByEditor = lastSentMsRef.current === initialMs;
    const changedExternally =
      lastExternalInitialMsRef.current !== initialMs && !wasSentByEditor;

    currentMsRef.current = initialMs;
    if (changedExternally) {
      const nextDigits = msToClockDigits(initialMs);
      editableDigitsRef.current = nextDigits;
      setEditableDigits(nextDigits);
      editBaselineMsRef.current = initialMs;
      isEditingRef.current = false;
      setIsEditing(false);
    }

    lastExternalInitialMsRef.current = initialMs;
    if (wasSentByEditor) lastSentMsRef.current = null;
  }, [editBaselineMsRef, initialMs, isEditable, isEditingRef]);

  const handleBlur = () => {
    const canonicalDigits = msToClockDigits(currentMsRef.current);
    editableDigitsRef.current = canonicalDigits;
    setEditableDigits(canonicalDigits);
    finishEditing();
  };

  if (isEditable) {
    const editableMs = clockDigitsToMs(editableDigits);
    const timeStr = formatTime(editableMs);

    return (
      <div
        ref={displayRef}
        role="spinbutton"
        tabIndex={0}
        aria-label="Timer duration"
        aria-valuemin={0}
        aria-valuemax={MAX_TIMER_DURATION_MS / 1000}
        aria-valuenow={Math.floor(editableMs / 1000)}
        aria-valuetext={timeStr}
        onKeyDown={handleKeyDown}
        onClick={() => displayRef.current?.focus()}
        onBlur={handleBlur}
        className="text-[5rem] font-semibold leading-none text-center tracking-tight tabular-nums cursor-text outline-none focus:outline-none text-black min-h-[5rem]"
      >
        <TimerDisplayRenderer timeStr={timeStr} isEditing={isEditing} />
      </div>
    );
  }

  return (
    <div
      className="text-[5rem] font-semibold leading-none text-center tracking-tight tabular-nums text-black min-h-[5rem]"
      aria-label={formatTime(displayMs)}
    >
      <TimerDisplayRenderer timeStr={formatTime(displayMs)} />
    </div>
  );
}
