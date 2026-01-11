import { useEffect } from "react";
import { isUserTyping } from "@/utils/keyboardUtils";
import type { Segment } from "@/types/segment";

interface UseSessionResultsKeyboardOptions {
  segments: Segment[];
  topApps: Array<{ bundleId: string }>;
  timelineSelectedIndex: number | null;
  listHoverIndex: number | null;
  selectedBundleId: string | null;
  isOnNote: boolean;
  isEditingNote: boolean;
  onSetTimelineSelectedIndex: (index: number | null) => void;
  onSetListHoverIndex: (index: number | null) => void;
  onSetIsOnNote: (isOn: boolean) => void;
  onSetIsEditingNote: (isEditing: boolean) => void;
  onTimelineClick: (segment: Segment) => void;
  onListToggle: (bundleId: string) => void;
  noteText: string;
  saveNote: () => void;
}

/**
 * Keyboard navigation hook for session results summary screen
 * 
 * Navigation:
 * - Starts on timeline (first block)
 * - Left/Right: Navigate timeline blocks
 * - Down from timeline: Move to note section
 * - N key on note section: Enter editing mode
 * - Up/Down from note: Move to timeline/list
 * - Down from note: Move to first list item (hover state)
 * - Up/Down in list: Navigate list items (hover state)
 * - Enter in list: Toggle selection of hovered item
 * - Up from first list item: Return to note section
 */
export function useSessionResultsKeyboard({
  segments,
  topApps,
  timelineSelectedIndex,
  listHoverIndex,
  selectedBundleId,
  isOnNote,
  isEditingNote,
  onSetTimelineSelectedIndex,
  onSetListHoverIndex,
  onSetIsOnNote,
  onSetIsEditingNote,
  onTimelineClick,
  onListToggle,
  noteText,
  saveNote,
}: UseSessionResultsKeyboardOptions): void {
  const topAppsCount = topApps.length;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // When editing note, handle arrow keys to exit and allow Cmd shortcuts to pass through
      if (isEditingNote) {
        // Allow Cmd/Ctrl shortcuts to pass through (like Cmd+A for activities)
        if (event.metaKey || event.ctrlKey) {
          // Don't block - let other handlers process Cmd shortcuts
          return;
        }
        
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          // Always exit editing mode and save
          saveNote();
          onSetIsEditingNote(false);
          onSetIsOnNote(false);
          
          if (event.key === "ArrowUp") {
            // Move to timeline
            if (segments.length > 0) {
              onSetTimelineSelectedIndex(0);
            }
          } else {
            // Move to list
            if (topAppsCount > 0) {
              onSetListHoverIndex(0);
            }
          }
          return;
        }
        // Allow normal typing
        return;
      }

      // Ignore shortcuts when user is typing (but not in note editing mode which we handle above)
      if (isUserTyping()) {
        return;
      }

      // Only handle when no modifier keys are pressed
      const isModifierPressed = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
      if (isModifierPressed) {
        return;
      }

      // Determine current navigation mode
      const isOnTimeline = timelineSelectedIndex !== null && segments.length > 0;
      const isOnList = listHoverIndex !== null;

      // N key - global shortcut to start editing note (works from any state)
      if ((event.key === "n" || event.key === "N") && !isEditingNote) {
        event.preventDefault();
        onSetTimelineSelectedIndex(null);
        onSetListHoverIndex(null);
        onSetIsOnNote(true);
        onSetIsEditingNote(true);
        return;
      }

      // Note section navigation
      if (isOnNote && !isEditingNote) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onSetIsOnNote(false);
          if (segments.length > 0) {
            onSetTimelineSelectedIndex(0);
          }
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onSetIsOnNote(false);
          if (topAppsCount > 0) {
            onSetListHoverIndex(0);
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          // Enter editing mode
          onSetIsEditingNote(true);
          return;
        }
      }

      // Timeline navigation (left/right)
      if (isOnTimeline) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          if (segments.length === 0) return;
          const newIndex = timelineSelectedIndex === 0 
            ? segments.length - 1 
            : timelineSelectedIndex - 1;
          onSetTimelineSelectedIndex(newIndex);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          if (segments.length === 0) return;
          const newIndex = timelineSelectedIndex === segments.length - 1 
            ? 0 
            : timelineSelectedIndex + 1;
          onSetTimelineSelectedIndex(newIndex);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          // Move to note section
          onSetTimelineSelectedIndex(null);
          onSetIsOnNote(true);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          // Click the selected timeline segment
          if (segments[timelineSelectedIndex]) {
            onTimelineClick(segments[timelineSelectedIndex]);
          }
          return;
        }
      }

      // List navigation (up/down, enter to toggle)
      if (isOnList) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (listHoverIndex === 0) {
            // Move to note section
            onSetListHoverIndex(null);
            onSetIsOnNote(true);
          } else {
            onSetListHoverIndex(listHoverIndex - 1);
          }
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (listHoverIndex < topAppsCount - 1) {
            onSetListHoverIndex(listHoverIndex + 1);
          } else {
            // Wrap to top
            onSetListHoverIndex(0);
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          // Toggle selection of hovered item
          if (listHoverIndex !== null && topApps[listHoverIndex]) {
            onListToggle(topApps[listHoverIndex].bundleId);
          }
          return;
        }
      }
    };

    // Use capture phase to ensure we catch events before other handlers (like TimerView)
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    segments,
    topApps,
    topAppsCount,
    timelineSelectedIndex,
    listHoverIndex,
    selectedBundleId,
    isOnNote,
    isEditingNote,
    onSetTimelineSelectedIndex,
    onSetListHoverIndex,
    onSetIsOnNote,
    onSetIsEditingNote,
    onTimelineClick,
    onListToggle,
    noteText,
    saveNote,
  ]);
}

