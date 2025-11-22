import { useEffect } from "react";
import { isUserTyping } from "@/utils/keyboardUtils";
import { groupSessionsByDay } from "@/utils/dateUtils";
import type { SessionSummary } from "@/types/timer";

interface UseActivitiesKeyboardOptions {
  sessions: SessionSummary[];
  selectedIndex: number | null;
  viewMode: "list" | "block";
  selectedSession: SessionSummary | null;
  onSetViewMode: (mode: "list" | "block") => void;
  onSetSelectedIndex: (index: number | null | ((prev: number | null) => number | null)) => void;
  onSessionClick: (session: SessionSummary) => void;
}

/**
 * Keyboard shortcuts hook for activities view
 * 
 * Shortcuts:
 * - b/l: Switch between block/list view
 * - Arrow keys: Navigate through sessions
 * - Enter: Open selected session
 */
export function useActivitiesKeyboard({
  sessions,
  selectedIndex,
  viewMode,
  selectedSession,
  onSetViewMode,
  onSetSelectedIndex,
  onSessionClick,
}: UseActivitiesKeyboardOptions): void {
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

      // b: block view, l: list view
      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        onSetViewMode("block");
        return;
      }
      if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        onSetViewMode("list");
        return;
      }

      // Navigation only works when there are sessions and we're not viewing a session detail
      if (selectedSession || sessions.length === 0 || selectedIndex === null) {
        return;
      }

      // Handle Enter key to open selected session
      if (event.key === "Enter") {
        event.preventDefault();
        const sessionToOpen = sessions[selectedIndex];
        if (sessionToOpen) {
          onSessionClick(sessionToOpen);
        }
        return;
      }

      // List view navigation (up/down arrows)
      if (viewMode === "list") {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onSetSelectedIndex((prev) => {
            if (prev === null) return 0;
            return prev === 0 ? sessions.length - 1 : prev - 1;
          });
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onSetSelectedIndex((prev) => {
            if (prev === null) return 0;
            return prev === sessions.length - 1 ? 0 : prev + 1;
          });
          return;
        }
      }

      // Block view navigation (all 4 arrow keys)
      if (viewMode === "block") {
        const dayGroups = groupSessionsByDay(sessions);
        const COLUMNS = 3;

        // Find which day group and position within that group
        let itemsBeforeCurrentGroup = 0;
        let currentGroupIndex = 0;
        let positionInGroup = selectedIndex;

        for (let i = 0; i < dayGroups.length; i++) {
          const groupSize = dayGroups[i].sessions.length;
          if (positionInGroup < groupSize) {
            currentGroupIndex = i;
            break;
          }
          itemsBeforeCurrentGroup += groupSize;
          positionInGroup -= groupSize;
        }

        const currentGroup = dayGroups[currentGroupIndex];
        const rowsInCurrentGroup = Math.ceil(currentGroup.sessions.length / COLUMNS);
        const currentRowInGroup = Math.floor(positionInGroup / COLUMNS);
        const currentColInGroup = positionInGroup % COLUMNS;

        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (currentRowInGroup > 0) {
            // Move up within same group
            const newPositionInGroup = positionInGroup - COLUMNS;
            onSetSelectedIndex(itemsBeforeCurrentGroup + newPositionInGroup);
          } else if (currentGroupIndex > 0) {
            // Move to previous group's last row
            const prevGroup = dayGroups[currentGroupIndex - 1];
            const prevGroupRows = Math.ceil(prevGroup.sessions.length / COLUMNS);
            const lastRowStart = (prevGroupRows - 1) * COLUMNS;
            const targetCol = Math.min(currentColInGroup, prevGroup.sessions.length - lastRowStart - 1);
            let itemsBeforePrevGroup = 0;
            for (let i = 0; i < currentGroupIndex - 1; i++) {
              itemsBeforePrevGroup += dayGroups[i].sessions.length;
            }
            onSetSelectedIndex(itemsBeforePrevGroup + lastRowStart + targetCol);
          } else {
            // Wrap to last group's last row
            const lastGroup = dayGroups[dayGroups.length - 1];
            const lastGroupRows = Math.ceil(lastGroup.sessions.length / COLUMNS);
            const lastRowStart = (lastGroupRows - 1) * COLUMNS;
            const targetCol = Math.min(currentColInGroup, lastGroup.sessions.length - lastRowStart - 1);
            let itemsBeforeLastGroup = 0;
            for (let i = 0; i < dayGroups.length - 1; i++) {
              itemsBeforeLastGroup += dayGroups[i].sessions.length;
            }
            onSetSelectedIndex(itemsBeforeLastGroup + lastRowStart + targetCol);
          }
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          const nextPositionInGroup = positionInGroup + COLUMNS;
          
          if (nextPositionInGroup < currentGroup.sessions.length) {
            // Move down within same group
            onSetSelectedIndex(itemsBeforeCurrentGroup + nextPositionInGroup);
          } else if (currentGroupIndex < dayGroups.length - 1) {
            // Move to next group's first row
            const nextGroup = dayGroups[currentGroupIndex + 1];
            const targetCol = Math.min(currentColInGroup, nextGroup.sessions.length - 1);
            let itemsBeforeNextGroup = 0;
            for (let i = 0; i <= currentGroupIndex; i++) {
              itemsBeforeNextGroup += dayGroups[i].sessions.length;
            }
            onSetSelectedIndex(itemsBeforeNextGroup + targetCol);
          } else {
            // Wrap to first group's first row
            const firstGroup = dayGroups[0];
            const targetCol = Math.min(currentColInGroup, firstGroup.sessions.length - 1);
            onSetSelectedIndex(targetCol);
          }
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          if (currentColInGroup > 0) {
            // Move left within same row
            onSetSelectedIndex(itemsBeforeCurrentGroup + positionInGroup - 1);
          } else if (currentRowInGroup > 0) {
            // Move to previous row's last column
            const prevRowStart = (currentRowInGroup - 1) * COLUMNS;
            const lastColInPrevRow = Math.min(COLUMNS - 1, currentGroup.sessions.length - prevRowStart - 1);
            onSetSelectedIndex(itemsBeforeCurrentGroup + prevRowStart + lastColInPrevRow);
          } else if (currentGroupIndex > 0) {
            // Move to previous group's last row, last column
            const prevGroup = dayGroups[currentGroupIndex - 1];
            const prevGroupRows = Math.ceil(prevGroup.sessions.length / COLUMNS);
            const lastRowStart = (prevGroupRows - 1) * COLUMNS;
            const lastCol = Math.min(COLUMNS - 1, prevGroup.sessions.length - lastRowStart - 1);
            let itemsBeforePrevGroup = 0;
            for (let i = 0; i < currentGroupIndex - 1; i++) {
              itemsBeforePrevGroup += dayGroups[i].sessions.length;
            }
            onSetSelectedIndex(itemsBeforePrevGroup + lastRowStart + lastCol);
          } else {
            // Wrap to last group's last row, last column
            const lastGroup = dayGroups[dayGroups.length - 1];
            const lastGroupRows = Math.ceil(lastGroup.sessions.length / COLUMNS);
            const lastRowStart = (lastGroupRows - 1) * COLUMNS;
            const lastCol = Math.min(COLUMNS - 1, lastGroup.sessions.length - lastRowStart - 1);
            let itemsBeforeLastGroup = 0;
            for (let i = 0; i < dayGroups.length - 1; i++) {
              itemsBeforeLastGroup += dayGroups[i].sessions.length;
            }
            onSetSelectedIndex(itemsBeforeLastGroup + lastRowStart + lastCol);
          }
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          const nextColInGroup = currentColInGroup + 1;
          const nextPositionInGroup = positionInGroup + 1;
          
          if (nextPositionInGroup < currentGroup.sessions.length && nextColInGroup < COLUMNS) {
            // Move right within same row
            onSetSelectedIndex(itemsBeforeCurrentGroup + nextPositionInGroup);
          } else if (currentRowInGroup < rowsInCurrentGroup - 1) {
            // Move to next row's first column
            const nextRowStart = (currentRowInGroup + 1) * COLUMNS;
            onSetSelectedIndex(itemsBeforeCurrentGroup + nextRowStart);
          } else if (currentGroupIndex < dayGroups.length - 1) {
            // Move to next group's first row, first column
            let itemsBeforeNextGroup = 0;
            for (let i = 0; i <= currentGroupIndex; i++) {
              itemsBeforeNextGroup += dayGroups[i].sessions.length;
            }
            onSetSelectedIndex(itemsBeforeNextGroup);
          } else {
            // Wrap to first group's first row, first column
            onSetSelectedIndex(0);
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sessions, selectedIndex, viewMode, selectedSession, onSetViewMode, onSetSelectedIndex, onSessionClick]);
}

