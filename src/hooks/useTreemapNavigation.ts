import { useEffect } from "react";
import { TreemapRect } from "@/components/stats/Treemap";
import { isUserTyping } from "@/utils/keyboardUtils";

interface UseTreemapNavigationProps {
  rects: TreemapRect[];
  selectedBundleId: string | null;
  onFocus: (bundleId: string) => void;
  onConfirm?: (bundleId: string) => void;
}

export function useTreemapNavigation({
  rects,
  selectedBundleId,
  onFocus,
  onConfirm,
}: UseTreemapNavigationProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isUserTyping()) return;
      
      // Only handle arrow keys and Enter without modifiers
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      event.preventDefault();

      if (rects.length === 0) return;

      // If nothing selected, select the first one (usually largest/top-left)
      if (!selectedBundleId) {
        onFocus(rects[0].app.bundleId);
        return;
      }

      // Handle Enter key
      if (event.key === "Enter") {
        if (onConfirm && selectedBundleId) {
          onConfirm(selectedBundleId);
        }
        return;
      }

      const currentRect = rects.find((r) => r.app.bundleId === selectedBundleId);
      if (!currentRect) {
        // If selection invalid, select first
        onFocus(rects[0].app.bundleId);
        return;
      }

      const cx = currentRect.x + currentRect.width / 2;
      const cy = currentRect.y + currentRect.height / 2;

      let bestCandidate: TreemapRect | null = null;
      let minDistance = Infinity;

      // Weight the cross-axis distance higher to prefer direct neighbors
      const CROSS_AXIS_WEIGHT = 4; 

      rects.forEach((rect) => {
        if (rect.app.bundleId === selectedBundleId) return;

        const rcx = rect.x + rect.width / 2;
        const rcy = rect.y + rect.height / 2;
        
        const dx = rcx - cx;
        const dy = rcy - cy;

        let isValid = false;
        let dist = Infinity;

        switch (event.key) {
          case "ArrowUp":
            // Must be above (dy < 0)
            // To feel natural, overlap in X is important.
            if (dy < 0) {
                isValid = true;
                dist = Math.sqrt((dy * dy) + (dx * CROSS_AXIS_WEIGHT) ** 2);
            }
            break;
          case "ArrowDown":
            if (dy > 0) {
                isValid = true;
                dist = Math.sqrt((dy * dy) + (dx * CROSS_AXIS_WEIGHT) ** 2);
            }
            break;
          case "ArrowLeft":
            if (dx < 0) {
                isValid = true;
                dist = Math.sqrt((dx * dx) + (dy * CROSS_AXIS_WEIGHT) ** 2);
            }
            break;
          case "ArrowRight":
            if (dx > 0) {
                isValid = true;
                dist = Math.sqrt((dx * dx) + (dy * CROSS_AXIS_WEIGHT) ** 2);
            }
            break;
        }

        if (isValid && dist < minDistance) {
          minDistance = dist;
          bestCandidate = rect;
        }
      });

      if (bestCandidate) {
        onFocus((bestCandidate as TreemapRect).app.bundleId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rects, selectedBundleId, onFocus, onConfirm]);
}
