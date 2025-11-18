import { useEffect, useRef, useCallback } from "react";
import { isUserTyping } from "@/utils/keyboardUtils";
import { mmssToMs } from "@/utils/timeUtils";

interface UseTimerKeyboardOptions {
  isEditable: boolean;
  editableValue: number;
  setEditableValue: (updater: (prev: number) => number) => void;
  onTimeChange?: (ms: number) => void;
  displayRef: React.RefObject<HTMLDivElement | null>;
  lastSentMsRef: React.MutableRefObject<number | null>;
  isLabelDropdownOpen?: boolean;
}

/**
 * Custom hook for handling keyboard input in editable timer display
 * Supports both global (unfocused) and local (focused) keyboard input
 */
export function useTimerKeyboard({
  isEditable,
  editableValue: _editableValue,
  setEditableValue,
  onTimeChange,
  displayRef,
  lastSentMsRef,
  isLabelDropdownOpen = false,
}: UseTimerKeyboardOptions) {
  const isProcessingKeyRef = useRef<boolean>(false);

  // Handle keyboard input for timer editing
  const handleKeyInput = useCallback(
    (key: string, preventDefault: () => void, stopImmediate?: () => void) => {
      if (!isEditable || isLabelDropdownOpen) return false;

      // Prevent double-processing
      if (isProcessingKeyRef.current) return false;
      isProcessingKeyRef.current = true;

      // Stop immediate propagation if available (prevents other listeners)
      if (stopImmediate) {
        stopImmediate();
      }

      // Reset flag after processing
      requestAnimationFrame(() => {
        isProcessingKeyRef.current = false;
      });

      // Handle number keys (0-9)
      if (key >= "0" && key <= "9") {
        preventDefault();
        const digit = parseInt(key, 10);
        setEditableValue((prevValue) => {
          const newValue = (prevValue * 10 + digit) % 10000;
          // Update parent state immediately so duration picker syncs in real-time
          if (onTimeChange) {
            const msValue = mmssToMs(newValue);
            lastSentMsRef.current = msValue;
            onTimeChange(msValue);
          }
          return newValue;
        });
        return true;
      }

      // Handle backspace
      if (key === "Backspace") {
        preventDefault();
        setEditableValue((prevValue) => {
          const newValue = Math.floor(prevValue / 10);
          // Update parent state immediately so duration picker syncs in real-time
          if (onTimeChange) {
            const msValue = mmssToMs(newValue);
            lastSentMsRef.current = msValue;
            onTimeChange(msValue);
          }
          return newValue;
        });
        return true;
      }

      isProcessingKeyRef.current = false;
      return false;
    },
    [isEditable, onTimeChange, setEditableValue, lastSentMsRef, isLabelDropdownOpen]
  );

  // Global keyboard listener for when display is editable but not focused
  useEffect(() => {
    if (!isEditable) return;

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      // Don't interfere if user is typing in an input field
      if (isUserTyping()) return;

      // Don't handle if the display is already focused (let the local handler deal with it)
      if (displayRef.current && document.activeElement === displayRef.current) {
        return;
      }

      // Don't interfere with mode switching shortcuts (T, S, B), Enter (start), or Space (end)
      const isModifierPressed = event.metaKey || event.ctrlKey;
      if (
        event.key === "Enter" ||
        event.key === " " ||
        (event.key === "t" && !isModifierPressed) ||
        (event.key === "s" && !isModifierPressed) ||
        event.key === "b"
      ) {
        return;
      }

      // Handle number keys and backspace
      const handled = handleKeyInput(
        event.key,
        () => event.preventDefault(),
        () => event.stopImmediatePropagation()
      );
      if (handled) {
        // Focus the display when user starts typing
        if (displayRef.current) {
          displayRef.current.focus();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isEditable, handleKeyInput, displayRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isEditable) return;

      // If already processing, skip (global handler already handled it)
      if (isProcessingKeyRef.current) return;

      const handled = handleKeyInput(e.key, () => e.preventDefault());

      // Prevent default behavior for other single-character keys to avoid unwanted input
      if (!handled && e.key.length === 1) {
        e.preventDefault();
      }
    },
    [isEditable, handleKeyInput]
  );

  return { handleKeyDown, isProcessingKeyRef };
}

