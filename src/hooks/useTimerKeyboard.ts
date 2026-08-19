import { useEffect, useRef, useCallback } from "react";
import { isUserTyping } from "@/utils/keyboardUtils";
import { clockDigitsToMs, msToClockDigits } from "@/utils/timeUtils";

interface UseTimerKeyboardOptions {
  isEditable: boolean;
  setEditableDigits: React.Dispatch<React.SetStateAction<string>>;
  editableDigitsRef: React.MutableRefObject<string>;
  onTimeChange?: (ms: number) => void;
  displayRef: React.RefObject<HTMLDivElement | null>;
  lastSentMsRef: React.MutableRefObject<number | null>;
  currentMsRef: React.MutableRefObject<number>;
  isEditingRef: React.MutableRefObject<boolean>;
  editBaselineMsRef: React.MutableRefObject<number>;
  maxDurationMs: number;
  isLabelDropdownOpen?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
}

/** Handle focused and global direct-entry shortcuts for the editable clock. */
export function useTimerKeyboard({
  isEditable,
  setEditableDigits,
  editableDigitsRef,
  onTimeChange,
  displayRef,
  lastSentMsRef,
  currentMsRef,
  isEditingRef,
  editBaselineMsRef,
  maxDurationMs,
  isLabelDropdownOpen = false,
  onEditingChange,
}: UseTimerKeyboardOptions) {
  const isProcessingKeyRef = useRef(false);

  const emitTime = useCallback(
    (ms: number) => {
      currentMsRef.current = ms;
      lastSentMsRef.current = ms;
      onTimeChange?.(ms);
    },
    [currentMsRef, lastSentMsRef, onTimeChange]
  );

  const beginEditing = useCallback(() => {
    if (isEditingRef.current) return;
    editBaselineMsRef.current = currentMsRef.current;
    isEditingRef.current = true;
    onEditingChange?.(true);
  }, [currentMsRef, editBaselineMsRef, isEditingRef, onEditingChange]);

  const finishEditing = useCallback(() => {
    isEditingRef.current = false;
    onEditingChange?.(false);
  }, [isEditingRef, onEditingChange]);

  const handleKeyInput = useCallback(
    (key: string, preventDefault: () => void, stopImmediate?: () => void) => {
      if (!isEditable || isLabelDropdownOpen || isProcessingKeyRef.current) {
        return false;
      }

      const isDigit = key >= "0" && key <= "9";
      const isEditingKey = isDigit || key === "Backspace" || key === "Escape";
      if (!isEditingKey) return false;

      isProcessingKeyRef.current = true;
      stopImmediate?.();
      requestAnimationFrame(() => {
        isProcessingKeyRef.current = false;
      });

      if (isDigit) {
        preventDefault();
        const wasEditing = isEditingRef.current;
        beginEditing();
        const candidate = `${wasEditing ? editableDigitsRef.current : ""}${key}`.slice(-6);
        const candidateMs = clockDigitsToMs(candidate);
        if (candidateMs <= maxDurationMs) {
          editableDigitsRef.current = candidate;
          setEditableDigits(candidate);
          emitTime(candidateMs);
        }
        return true;
      }

      if (key === "Backspace") {
        preventDefault();
        const wasEditing = isEditingRef.current;
        beginEditing();
        const nextDigits = wasEditing ? editableDigitsRef.current.slice(0, -1) : "";
        editableDigitsRef.current = nextDigits;
        setEditableDigits(nextDigits);
        emitTime(clockDigitsToMs(nextDigits));
        return true;
      }

      if (key === "Escape" && isEditingRef.current) {
        preventDefault();
        const baselineMs = editBaselineMsRef.current;
        const baselineDigits = msToClockDigits(baselineMs);
        editableDigitsRef.current = baselineDigits;
        setEditableDigits(baselineDigits);
        emitTime(baselineMs);
        finishEditing();
        return true;
      }

      isProcessingKeyRef.current = false;
      return false;
    },
    [
      beginEditing,
      editableDigitsRef,
      editBaselineMsRef,
      emitTime,
      finishEditing,
      isEditable,
      isEditingRef,
      isLabelDropdownOpen,
      maxDurationMs,
      setEditableDigits,
    ]
  );

  useEffect(() => {
    if (!isEditable) return;

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isUserTyping()) return;
      if (displayRef.current && document.activeElement === displayRef.current) return;

      const handled = handleKeyInput(
        event.key,
        () => event.preventDefault(),
        () => event.stopImmediatePropagation()
      );
      if (handled) displayRef.current?.focus();
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [displayRef, handleKeyInput, isEditable]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isEditable || isProcessingKeyRef.current) return;
      const handled = handleKeyInput(event.key, () => event.preventDefault());
      if (!handled && event.key.length === 1) event.preventDefault();
    },
    [handleKeyInput, isEditable]
  );

  return { handleKeyDown, finishEditing };
}
