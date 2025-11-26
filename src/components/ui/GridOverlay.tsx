import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface GridLines {
  vertical: number[];   // x positions in px
  horizontal: number[]; // y positions in px
}

interface GridOverlayProps {
  lines: GridLines;
  color?: string;
  opacity?: number;
}

export function GridOverlay({ 
  lines, 
  color = "#999", 
  opacity = 0.3 
}: GridOverlayProps) {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-50"
      style={{ opacity }}
    >
      {/* Vertical lines */}
      {lines.vertical.map((x, i) => (
        <div
          key={`v-${i}`}
          className="absolute top-0 bottom-0"
          style={{
            left: x,
            width: 1,
            backgroundColor: color,
          }}
        />
      ))}
      
      {/* Horizontal lines */}
      {lines.horizontal.map((y, i) => (
        <div
          key={`h-${i}`}
          className="absolute left-0 right-0"
          style={{
            top: y,
            height: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
}

// Hook to toggle grid overlay with G key (only works in fullscreen)
export function useGridOverlay() {
  const [showGrid, setShowGrid] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check fullscreen status
  useEffect(() => {
    let cancelled = false;

    const checkFullscreen = async () => {
      try {
        const window = getCurrentWindow();
        const fullscreen = await window.isFullscreen();
        if (!cancelled) {
          setIsFullscreen(fullscreen);
          // Auto-hide grid when exiting fullscreen
          if (!fullscreen) {
            setShowGrid(false);
          }
        }
      } catch (err) {
        console.error("Failed to check fullscreen:", err);
      }
    };

    // Check initially
    checkFullscreen();

    // Listen for resize events (which happen when entering/exiting fullscreen)
    const handleResize = () => {
      checkFullscreen();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only toggle on plain G key (no modifiers)
      if (
        (e.key === "g" || e.key === "G") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        // Don't toggle if user is typing in an input
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        // Only allow toggling in fullscreen mode
        if (isFullscreen) {
          setShowGrid((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  return { showGrid: showGrid && isFullscreen, setShowGrid, isFullscreen };
}

// Predefined grid configurations for different views
// All values must be multiples of the 8px base unit
export const TIMER_GRID: GridLines = {
  vertical: [
    32,      // left-8 (4 × 8px)
    32 + 24, // right edge of KeyBox (24px = 3 × 8px)
    // Center area - will be calculated dynamically or use viewport center
  ],
  horizontal: [
    32,       // top-8 (4 × 8px)
    32 + 24,  // after first button row (24px height = 3 × 8px)
    32 + 24 + 8 + 24, // after second button (gap-2 = 8px)
    32 + 24 + 8 + 24 + 8 + 24, // after third button
    208,      // top-52 (26 × 8px)
  ],
};

// Helper to generate grid lines based on window size
export function generateCenteredGrid(
  windowWidth: number,
  windowHeight: number,
  contentWidth: number = 448 // max-w-md
): GridLines {
  const centerX = windowWidth / 2;
  const centerY = windowHeight / 2;
  const halfContent = contentWidth / 2;

  return {
    vertical: [
      32,                          // left-8
      windowWidth - 32,            // right-8
      centerX - halfContent,       // content left edge
      centerX,                     // center
      centerX + halfContent,       // content right edge
    ],
    horizontal: [
      32,                          // top-8
      208,                         // top-52
      windowHeight - 32,           // bottom-8
      centerY,                     // center
    ],
  };
}
