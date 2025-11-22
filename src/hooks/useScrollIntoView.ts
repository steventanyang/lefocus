import { useRef, useCallback } from "react";

interface UseScrollIntoViewProps {
  enabled?: boolean;
  getScrollContainer?: () => HTMLElement | null;
}

/**
 * Hook for handling scroll-into-view behavior for lists
 * Provides ref management and scroll functionality for keyboard navigation
 * @param options Configuration options
 * @returns Object containing scroll function and ref
 */
export function useScrollIntoView<T extends HTMLElement>({ 
  enabled = true, 
  getScrollContainer 
}: UseScrollIntoViewProps = {}) {
  const scrollRefs = useRef<(T | null)[]>([]);

  // Find the scrollable parent container (similar to ActivitiesView)
  const defaultGetScrollContainer = useCallback((): HTMLElement | null => {
    let element: HTMLElement | null = document.body;
    while (element) {
      const style = window.getComputedStyle(element);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        return element;
      }
      element = element.parentElement;
    }
    return document.body;
  }, []);

  /**
   * Scroll specified item into view with appropriate alignment
   * @param index Index of item to scroll to
   */
  const scrollToItem = (index: number) => {
    if (!enabled) return;
    
    const selectedItem = scrollRefs.current[index];
    if (!selectedItem) return;

    const scrollContainer = getScrollContainer ? getScrollContainer() : defaultGetScrollContainer();
    if (!scrollContainer) return;

    // Use requestAnimationFrame to ensure DOM updates complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (index === 0) {
          // For first item, scroll to top to show header
          scrollContainer.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        } else {
          // For other items, center them in the viewport
          selectedItem.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      });
    });
  };

  return {
    scrollRefs,
    scrollToItem,
  };
}
