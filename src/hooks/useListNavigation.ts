import { useEffect } from "react";
import { isUserTyping } from "@/utils/keyboardUtils";

interface UseListNavigationProps<T> {
  items: T[];
  selectedIndex: number | null;
  onSelectIndex: (index: number) => void;
  onConfirm: (item: T) => void;
  isActive?: boolean;
}

export function useListNavigation<T>({
  items,
  selectedIndex,
  onSelectIndex,
  onConfirm,
  isActive = true,
}: UseListNavigationProps<T>) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isUserTyping()) return;
      
      // Only handle arrow keys without modifiers
      if (!["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      if (items.length === 0) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const newIndex = selectedIndex === null || selectedIndex === 0 
          ? items.length - 1 
          : selectedIndex - 1;
        onSelectIndex(newIndex);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        const newIndex = selectedIndex === null || selectedIndex === items.length - 1 
          ? 0 
          : selectedIndex + 1;
        onSelectIndex(newIndex);
      } else if (event.key === "Enter") {
        event.preventDefault();
        // Auto-select first item if none is selected when Enter is pressed
        const indexToUse = selectedIndex !== null ? selectedIndex : 0;
        if (items[indexToUse]) {
          onConfirm(items[indexToUse]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items, selectedIndex, onSelectIndex, onConfirm, isActive]);
}
