"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPlaygroundMs } from "@/lib/time";
import { PRESETS } from "@/lib/timer-presets";

type Mode = "countdown" | "stopwatch";
type RunState = "idle" | "running" | "stopped";

function durationsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 100;
}

export function PlaygroundTimer() {
  const [mode, setMode] = useState<Mode>("countdown");
  const [runState, setRunState] = useState<RunState>("idle");
  const [selectedMs, setSelectedMs] = useState(PRESETS[0].ms);
  const [displayMs, setDisplayMs] = useState(PRESETS[0].ms);

  const endAtRef = useRef<number | null>(null);
  const startAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (runState !== "running") return;

    const tick = () => {
      if (mode === "countdown") {
        const end = endAtRef.current;
        if (end == null) return;
        const rem = Math.max(0, end - Date.now());
        setDisplayMs(rem);
        if (rem <= 0) {
          endAtRef.current = null;
          setRunState("idle");
          setDisplayMs(selectedMs);
        }
      } else {
        const start = startAtRef.current;
        if (start == null) return;
        setDisplayMs(Date.now() - start);
      }
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [runState, mode, selectedMs]);

  const canChangeMode = runState === "idle";

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (!canChangeMode) return;
      setMode(next);
      if (next === "countdown") {
        setDisplayMs(selectedMs);
      } else {
        setDisplayMs(0);
      }
    },
    [canChangeMode, selectedMs]
  );

  const handlePreset = useCallback(
    (ms: number) => {
      if (runState !== "idle" || mode !== "countdown") return;
      setSelectedMs(ms);
      setDisplayMs(ms);
    },
    [runState, mode]
  );

  const start = useCallback(() => {
    if (runState !== "idle") return;
    if (mode === "countdown") {
      endAtRef.current = Date.now() + displayMs;
    } else {
      startAtRef.current = Date.now();
      setDisplayMs(0);
    }
    setRunState("running");
  }, [runState, mode, displayMs]);

  const cancel = useCallback(() => {
    endAtRef.current = null;
    startAtRef.current = null;
    setRunState("idle");
    if (mode === "countdown") {
      setDisplayMs(selectedMs);
    } else {
      setDisplayMs(0);
    }
  }, [mode, selectedMs]);

  const endStopwatch = useCallback(() => {
    if (runState !== "running" || mode !== "stopwatch") return;
    startAtRef.current = null;
    setRunState("stopped");
  }, [runState, mode]);

  const resetStopped = useCallback(() => {
    setRunState("idle");
    setDisplayMs(0);
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canChangeMode}
          onClick={() => handleModeChange("countdown")}
          className={
            mode === "countdown"
              ? "border border-black bg-black px-3 py-1.5 text-xs font-semibold text-white"
              : "border border-transparent px-3 py-1.5 text-xs font-light text-neutral-600 hover:border-black disabled:opacity-40"
          }
        >
          timer
        </button>
        <button
          type="button"
          disabled={!canChangeMode}
          onClick={() => handleModeChange("stopwatch")}
          className={
            mode === "stopwatch"
              ? "border border-black bg-black px-3 py-1.5 text-xs font-semibold text-white"
              : "border border-transparent px-3 py-1.5 text-xs font-light text-neutral-600 hover:border-black disabled:opacity-40"
          }
        >
          stopwatch
        </button>
      </div>

      <div className="text-5xl font-medium tabular-nums tracking-tight text-black md:text-6xl">
        {formatPlaygroundMs(displayMs)}
      </div>

      {runState === "idle" && mode === "countdown" && (
        <div className="flex flex-wrap justify-center gap-2">
          {PRESETS.map((p) => {
            const selected = durationsEqual(selectedMs, p.ms);
            return (
              <button
                key={p.ms}
                type="button"
                onClick={() => handlePreset(p.ms)}
                className={
                  selected
                    ? "min-w-[72px] border border-black bg-black px-3 py-2 text-sm font-semibold text-white"
                    : "min-w-[72px] border border-transparent px-3 py-2 text-sm font-semibold text-black hover:border-black"
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex min-h-[44px] flex-wrap justify-center gap-3">
        {runState === "idle" && (
          <button
            type="button"
            onClick={start}
            className="min-w-[120px] border border-black bg-transparent px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Start
          </button>
        )}

        {runState === "running" && mode === "countdown" && (
          <button
            type="button"
            onClick={cancel}
            className="min-w-[120px] border border-black bg-transparent px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Cancel
          </button>
        )}

        {runState === "running" && mode === "stopwatch" && (
          <>
            <button
              type="button"
              onClick={endStopwatch}
              className="min-w-[120px] border border-black bg-transparent px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
            >
              End
            </button>
            <button
              type="button"
              onClick={cancel}
              className="min-w-[120px] border border-black bg-transparent px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
            >
              Cancel
            </button>
          </>
        )}

        {runState === "stopped" && (
          <button
            type="button"
            onClick={resetStopped}
            className="min-w-[120px] border border-black bg-transparent px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
