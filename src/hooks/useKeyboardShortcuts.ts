import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isUserTyping, isMac } from "@/utils/keyboardUtils";

interface UseKeyboardShortcutsOptions {
  onStart: () => void;
  onSwitchMode: (mode: "countdown" | "stopwatch" | "break") => void;
  isIdle: boolean;
  startDisabled: boolean;
  isSessionResultsDisplayed?: boolean; // Prevent shortcuts when session results are shown
}

/**
 * Keyboard shortcuts hook for timer view
 *
 * Shortcuts:
 * - Return/Enter: Start timer (only when idle and not disabled)
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
  isSessionResultsDisplayed = false,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      // Don't handle shortcuts when session results are displayed
      if (isSessionResultsDisplayed) {
        return;
      }

      const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;

      // Return/Enter: Start timer
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
  }, [onStart, onSwitchMode, isIdle, startDisabled, isSessionResultsDisplayed]);
}

/**
 * Global navigation shortcuts hook (works from anywhere in the app)
 *
 * Shortcuts:
 * - Cmd+A (Mac) / Ctrl+A (non-Mac): Navigate to activities
 * - Cmd+T (Mac) / Ctrl+T (non-Mac): Navigate to timer
 * - Cmd+S (Mac) / Ctrl+S (non-Mac): Navigate to stats
 * - Cmd+W (Mac) / Ctrl+W (non-Mac): Prevent window close (blocked)
 * - Cmd+F (Mac) / Ctrl+F (non-Mac): Toggle fullscreen
 */
export function useGlobalNavigationShortcuts(
  onNavigateActivities: () => void,
  onNavigateTimer: () => void,
  onNavigateStats: () => void
): void {
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
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

      // Cmd+S (Mac) or Ctrl+S (non-Mac): Navigate to stats
      if (event.key === "s" && isModifierPressed) {
        event.preventDefault(); // Prevent browser "Save"
        onNavigateStats();
        return;
      }

      // Cmd+W (Mac) or Ctrl+W (non-Mac): Prevent window close
      if (event.key === "w" && isModifierPressed) {
        event.preventDefault(); // Prevent window close
        event.stopPropagation();
        return;
      }

      // Cmd+F (Mac) or Ctrl+F (non-Mac): Toggle fullscreen
      if ((event.key === "f" || event.key === "F") && isModifierPressed) {
        event.preventDefault();
        event.stopPropagation();
        try {
          const window = getCurrentWindow();
          const isFullscreen = await window.isFullscreen();
          await window.setFullscreen(!isFullscreen);
        } catch (err) {
          console.error("Failed to toggle fullscreen:", err);
        }
        return;
      }
    };

    // Use capture phase to ensure we catch the event before other handlers
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onNavigateActivities, onNavigateTimer, onNavigateStats]);
}
