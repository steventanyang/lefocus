import { useState } from "react";

interface UseSelectionStateProps<T> {
  items: T[];
  getItemKey: (item: T) => string;
  initialSelectedIndex?: number | null;
}

/**
 * Hook for managing selection state with separate focus and hover states
 * Prevents mouse hover from interfering with keyboard navigation
 * @param options Configuration
 * @returns Selection state and handlers
 */
export function useSelectionState<T>({ 
  items, 
  getItemKey,
  initialSelectedIndex = null 
}: UseSelectionStateProps<T>) {
  const [focusedKey, setFocusedKey] = useState<string | null>(() => {
    if (initialSelectedIndex !== null && items[initialSelectedIndex]) {
      return getItemKey(items[initialSelectedIndex]);
    }
    return null;
  });
  
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const focusedIndex = focusedKey 
    ? items.findIndex(item => getItemKey(item) === focusedKey) 
    : null;

  const isSelected = (item: T) => getItemKey(item) === focusedKey;
  const isHovered = (item: T) => getItemKey(item) === hoveredKey;
  const shouldShowFocus = (item: T) => isSelected(item) && !isHovered(item);

  const handleFocus = (key: string) => setFocusedKey(key);
  const handleHover = (key: string) => setHoveredKey(key);
  const handleHoverLeave = () => setHoveredKey(null);
  const selectByIndex = (index: number) => {
    if (items[index]) {
      setFocusedKey(getItemKey(items[index]));
    }
  };

  return {
    focusedKey,
    hoveredKey,
    focusedIndex,
    isSelected,
    isHovered,
    shouldShowFocus,
    handleFocus,
    handleHover,
    handleHoverLeave,
    selectByIndex,
  };
}
