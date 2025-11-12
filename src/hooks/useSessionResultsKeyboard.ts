import { useEffect } from "react";
import { isUserTyping } from "@/utils/keyboardUtils";
import type { Segment } from "@/types/segment";

interface UseSessionResultsKeyboardOptions {
  segments: Segment[];
  topApps: Array<{ bundleId: string }>;
  timelineSelectedIndex: number | null;
  listHoverIndex: number | null;
  selectedBundleId: string | null;
  onSetTimelineSelectedIndex: (index: number | null) => void;
  onSetListHoverIndex: (index: number | null) => void;
  onTimelineClick: (segment: Segment) => void;
  onListToggle: (bundleId: string) => void;
}

/**
 * Keyboard navigation hook for session results summary screen
 * 
 * Navigation:
 * - Starts on timeline (first block)
 * - Left/Right: Navigate timeline blocks
 * - Down from timeline: Move to first list item (hover state)
 * - Up/Down in list: Navigate list items (hover state)
 * - Enter in list: Toggle selection of hovered item
 * - Up from first list item: Return to timeline
 */
export function useSessionResultsKeyboard({
  segments,
  topApps,
  timelineSelectedIndex,
  listHoverIndex,
  selectedBundleId,
  onSetTimelineSelectedIndex,
  onSetListHoverIndex,
  onTimelineClick,
  onListToggle,
}: UseSessionResultsKeyboardOptions): void {
  const topAppsCount = topApps.length;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      // Only handle when no modifier keys are pressed
      const isModifierPressed = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
      if (isModifierPressed) {
        return;
      }

      // Determine current navigation mode
      const isOnTimeline = timelineSelectedIndex !== null;
      const isOnList = listHoverIndex !== null;

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
          // Move to first list item
          if (topAppsCount > 0) {
            onSetTimelineSelectedIndex(null);
            onSetListHoverIndex(0);
          }
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
            // Move back to timeline
            if (segments.length > 0) {
              onSetListHoverIndex(null);
              onSetTimelineSelectedIndex(0);
            }
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

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    segments,
    topApps,
    topAppsCount,
    timelineSelectedIndex,
    listHoverIndex,
    selectedBundleId,
    onSetTimelineSelectedIndex,
    onSetListHoverIndex,
    onTimelineClick,
    onListToggle,
  ]);
}

