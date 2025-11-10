import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface WindowSize {
  width: number;
  height: number;
}

async function getWindowSize(): Promise<WindowSize> {
  try {
    const window = getCurrentWindow();
    const physicalSize = await window.innerSize();
    const scaleFactor = await window.scaleFactor();
    return {
      width: physicalSize.width / scaleFactor,
      height: physicalSize.height / scaleFactor,
    };
  } catch (err) {
    console.error("Failed to get window size:", err);
    return { width: 0, height: 0 };
  }
}

export function useWindowSize(): WindowSize {
  const [size, setSize] = useState<WindowSize>({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;

    // Get initial size
    getWindowSize().then((initialSize) => {
      if (!cancelled) {
        setSize(initialSize);
      }
    });

    // Listen for window resize events
    const handleResize = () => {
      if (cancelled) return;
      getWindowSize().then((newSize) => {
        if (!cancelled) {
          setSize(newSize);
        }
      });
    };

    // Use standard window resize event
    window.addEventListener("resize", handleResize);

    // Also try to listen to Tauri resize events if available
    let unlistenFn: (() => void) | null = null;
    const windowInstance = getCurrentWindow();

    // Try to use Tauri's onResized if it exists
    if (typeof windowInstance.onResized === "function") {
      windowInstance
        .onResized(() => {
          if (cancelled) return;
          handleResize();
        })
        .then((unlisten) => {
          unlistenFn = unlisten;
        })
        .catch(() => {
          // If onResized doesn't work, that's okay - we have window resize
        });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  return size;
}
