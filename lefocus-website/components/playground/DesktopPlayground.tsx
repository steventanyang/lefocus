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

  const clamp = useCallback((nextX: number, nextY: number) => {
    const c = containerRef.current?.getBoundingClientRect();
    const w = windowRef.current?.getBoundingClientRect();
    if (!c || !w || !w.width || !w.height) return { x: nextX, y: nextY };
    const maxX = Math.max(0, c.width - w.width);
    const maxY = Math.max(0, c.height - w.height);
    return {
      x: Math.min(Math.max(0, nextX), maxX),
      y: Math.min(Math.max(0, nextY), maxY),
    };
  }, []);

  const centerWindow = useCallback(() => {
    const c = containerRef.current?.getBoundingClientRect();
    const w = windowRef.current?.getBoundingClientRect();
    if (!c || !w || w.width < 1) return;
    setPos({
      x: Math.max(0, (c.width - w.width) / 2),
      y: Math.max(0, (c.height - w.height) / 2),
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
      className="w-full max-w-5xl rounded-sm border border-black bg-cover bg-center px-4 py-10 sm:px-8 sm:py-14"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      <div
        ref={containerRef}
        className="relative min-h-[min(70vh,560px)] w-full"
      >
        <div
          ref={windowRef}
          className="absolute w-full max-w-lg overflow-hidden border border-black bg-white shadow-[4px_4px_0_0_rgba(0,0,0,0.08)]"
          style={{ left: pos.x, top: pos.y }}
        >
          <div
            role="presentation"
            onPointerDown={handleTitlePointerDown}
            className="flex h-8 cursor-grab select-none items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 active:cursor-grabbing"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden />
            <span className="ml-2 text-[10px] font-medium tracking-tight text-neutral-500">
              lefocus
            </span>
          </div>
          <div className="relative flex flex-col gap-8 px-4 pb-8 pt-6 sm:px-8">
            <PlaygroundTimer />
          </div>
        </div>
      </div>
    </section>
  );
}
