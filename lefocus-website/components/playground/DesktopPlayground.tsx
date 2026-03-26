"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { PlaygroundTimer } from "./PlaygroundTimer";

export function DesktopPlayground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  /** Use layout box sizes (not getBoundingClientRect) so clamp matches `left`/`top` + absolute sizing. */
  const clamp = useCallback((nextX: number, nextY: number) => {
    const c = containerRef.current;
    const w = windowRef.current;
    if (!c || !w) return { x: nextX, y: nextY };
    const maxX = Math.max(0, c.clientWidth - w.offsetWidth);
    const maxY = Math.max(0, c.clientHeight - w.offsetHeight);
    return {
      x: Math.min(Math.max(0, nextX), maxX),
      y: Math.min(Math.max(0, nextY), maxY),
    };
  }, []);

  const centerWindow = useCallback(() => {
    const c = containerRef.current;
    const w = windowRef.current;
    if (!c || !w || w.offsetWidth < 1) return;
    setPos({
      x: Math.max(0, (c.clientWidth - w.offsetWidth) / 2),
      y: Math.max(0, (c.clientHeight - w.offsetHeight) / 2),
    });
  }, []);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        centerWindow();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [centerWindow]);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => clamp(p.x, p.y));
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    const el = containerRef.current;
    if (el) ro.observe(el);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [clamp]);

  const handleTitlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const originX = pos.x;
      const originY = pos.y;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        setPos(clamp(originX + dx, originY + dy));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clamp, pos.x, pos.y]
  );

  return (
    <section
      className="mx-auto w-full max-w-5xl overflow-hidden rounded-sm bg-cover bg-center"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      <div
        ref={containerRef}
        className="relative min-h-[min(76vh,760px)] w-full"
      >
        <div
          ref={windowRef}
          className="absolute flex h-[480px] w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[4px_4px_0_0_rgba(0,0,0,0.08)]"
          style={{ left: pos.x, top: pos.y }}
        >
          <div
            role="presentation"
            onPointerDown={handleTitlePointerDown}
            className="flex h-8 shrink-0 cursor-grab select-none items-center gap-2 bg-white px-3 active:cursor-grabbing"
            aria-label="Drag window"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden />
          </div>
          {/* No padding here — absolute chrome in PlaygroundTimer uses full body under title bar */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <PlaygroundTimer />
          </div>
        </div>
      </div>
    </section>
  );
}
