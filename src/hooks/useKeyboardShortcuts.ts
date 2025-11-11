import { useEffect } from "react";

interface UseKeyboardShortcutsOptions {
  onStart: () => void;
  onSwitchMode: (mode: "countdown" | "stopwatch" | "break") => void;
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
 * - S: Switch to stopwatch mode (only when idle)
 * - T: Switch to timer/countdown mode (only when idle)
 * - B: Switch to break mode (only when idle)
 * - Cmd+B: Switch to break mode (only when idle)
 * 
 * Note: Cmd+A and Cmd+T are handled globally via useGlobalNavigationShortcuts
 */
export function useKeyboardShortcuts({
  onStart,
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

      // S: Switch to stopwatch mode (only when idle)
      if (event.key === "s" && isIdle && !isModifierPressed) {
        event.preventDefault();
        onSwitchMode("stopwatch");
        return;
      }

      // T: Switch to timer/countdown mode (only when idle, without modifier)
      // Note: Cmd+T is handled globally for navigation
      if (event.key === "t" && isIdle && !isModifierPressed) {
        event.preventDefault();
        onSwitchMode("countdown");
        return;
      }

      // B: Switch to break mode (only when idle, without modifier)
      if (event.key === "b" && isIdle && !isModifierPressed) {
        event.preventDefault();
        onSwitchMode("break");
        return;
      }

      // Cmd+B (Mac) or Ctrl+B (non-Mac): Switch to break mode (only when idle)
      if (event.key === "b" && isIdle && isModifierPressed) {
        event.preventDefault();
        onSwitchMode("break");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onStart, onSwitchMode, isIdle, startDisabled]);
}

/**
 * Global navigation shortcuts hook (works from anywhere in the app)
 *
 * Shortcuts:
 * - Cmd+A (Mac) / Ctrl+A (non-Mac): Navigate to activities
 * - Cmd+T (Mac) / Ctrl+T (non-Mac): Navigate to timer
 */
export function useGlobalNavigationShortcuts(
  onNavigateActivities: () => void,
  onNavigateTimer: () => void
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;

      // Cmd+A (Mac) or Ctrl+A (non-Mac): Navigate to activities
      if (event.key === "a" && isModifierPressed) {
        event.preventDefault(); // Prevent browser "Select All"
        onNavigateActivities();
        return;
      }

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
  }, [onNavigateActivities, onNavigateTimer]);
}
