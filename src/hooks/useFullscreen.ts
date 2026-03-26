import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Tracks whether the Tauri window is in fullscreen (updates on resize / toggle). */
export function useFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const w = getCurrentWindow();
        const next = await w.isFullscreen();
        if (!cancelled) setIsFullscreen(next);
      } catch {
        if (!cancelled) setIsFullscreen(false);
      }
    };

    check();
    window.addEventListener("resize", check);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", check);
    };
  }, []);

  return isFullscreen;
}
