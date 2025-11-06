import { useEffect } from "react";

interface UseKeyboardShortcutsOptions {
  onStart: () => void;
  onNavigateActivities: () => void;
  onSwitchMode: (mode: "countdown" | "stopwatch") => void;
  isIdle: boolean;
  startDisabled: boolean;
}

/**
 * Check if user is currently typing in an input field
 */
function isUserTyping(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toLowerCase();
  const isInput = tagName === "input";
  const isTextarea = tagName === "textarea";
  const isContentEditable =
    activeElement.getAttribute("contenteditable") === "true";

  return isInput || isTextarea || isContentEditable;
}

/**
 * Check if running on Mac (for Cmd vs Ctrl)
 */
function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

/**
 * Keyboard shortcuts hook for timer view
 *
 * Shortcuts:
 * - Enter: Start timer (only when idle and not disabled)
 * - Cmd+A (Mac) / Ctrl+A (non-Mac): Navigate to activities
 * - S: Switch to stopwatch mode (only when idle)
 * - T: Switch to timer/countdown mode (only when idle)
 */
export function useKeyboardShortcuts({
  onStart,
  onNavigateActivities,
  onSwitchMode,
  isIdle,
  startDisabled,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;

      // Enter: Start timer
      if (event.key === "Enter" && isIdle && !startDisabled) {
        event.preventDefault();
        onStart();
        return;
      }

      // Cmd+A (Mac) or Ctrl+A (non-Mac): Navigate to activities
      if (event.key === "a" && isModifierPressed) {
        event.preventDefault(); // Prevent browser "Select All"
        onNavigateActivities();
        return;
      }

      // S: Switch to stopwatch mode (only when idle)
      if (event.key === "s" && isIdle && !isModifierPressed) {
        event.preventDefault();
        onSwitchMode("stopwatch");
        return;
      }

      // T: Switch to timer/countdown mode (only when idle)
      if (event.key === "t" && isIdle && !isModifierPressed) {
        event.preventDefault();
        onSwitchMode("countdown");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onStart, onNavigateActivities, onSwitchMode, isIdle, startDisabled]);
}

/**
 * Simple hook for navigation shortcuts (used in ActivitiesView)
 *
 * Shortcuts:
 * - Cmd+T (Mac) / Ctrl+T (non-Mac): Navigate to timer
 */
export function useNavigationShortcuts(onNavigateTimer: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;

      // Cmd+T (Mac) or Ctrl+T (non-Mac): Navigate to timer
      if (event.key === "t" && isModifierPressed) {
        event.preventDefault(); // Prevent browser "New Tab"
        onNavigateTimer();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onNavigateTimer]);
}
