"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPlaygroundMs } from "@/lib/time";
import { BREAK_PRESETS, PRESETS } from "@/lib/timer-presets";
import { KeyBox } from "./KeyBox";
import { PlaygroundLabelTag } from "./PlaygroundLabelTag";

/** Demo labels — matte palette, same chip pattern as desktop `LabelTag` */
const PLAYGROUND_LABEL_PLACEHOLDERS = [
  { name: "writing", color: "#5c6670" },
  { name: "work", color: "#5d6e5d" },
  { name: "reading", color: "#6a5d56" },
] as const;

const LABEL_CHIP_WIDTH = "w-[5.25rem] shrink-0";

/** Corner chrome — top row sits higher so it lines up with the title strip */
const EDGE = {
  top: "top-2",
  /** L + label column sits a bit higher than T/S/B */
  topLabels: "top-0",
  left: "left-6",
  right: "right-6",
  bottom: "bottom-6",
} as const;

type Mode = "countdown" | "stopwatch" | "break";
type RunState = "idle" | "running" | "stopped";

function durationsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 100;
}

const modeRowClass =
  "group flex items-center gap-1.5 text-xs font-light text-gray-600";

export function PlaygroundTimer() {
  const [mode, setMode] = useState<Mode>("countdown");
  const [runState, setRunState] = useState<RunState>("idle");
  const [selectedMs, setSelectedMs] = useState(PRESETS[0].ms);
  const [selectedBreakMs, setSelectedBreakMs] = useState(BREAK_PRESETS[0].ms);
  const [displayMs, setDisplayMs] = useState(PRESETS[0].ms);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [selectedLabelIdx, setSelectedLabelIdx] = useState(0);

  const labelMenuRef = useRef<HTMLDivElement>(null);
  const endAtRef = useRef<number | null>(null);
  const startAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!labelMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = labelMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setLabelMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [labelMenuOpen]);

  useEffect(() => {
    if (runState !== "running") return;

    const tick = () => {
      if (mode === "countdown" || mode === "break") {
        const end = endAtRef.current;
        if (end == null) return;
        const rem = Math.max(0, end - Date.now());
        setDisplayMs(rem);
        if (rem <= 0) {
          endAtRef.current = null;
          setRunState("idle");
          setDisplayMs(mode === "break" ? selectedBreakMs : selectedMs);
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
  }, [runState, mode, selectedMs, selectedBreakMs]);

  const canChangeMode = runState === "idle";

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (!canChangeMode) return;
      setMode(next);
      if (next === "countdown") {
        setDisplayMs(selectedMs);
      } else if (next === "break") {
        setDisplayMs(selectedBreakMs);
      } else {
        setDisplayMs(0);
      }
    },
    [canChangeMode, selectedMs, selectedBreakMs]
  );

  const handlePreset = useCallback(
    (ms: number) => {
      if (runState !== "idle") return;
      if (mode === "countdown") {
        setSelectedMs(ms);
        setDisplayMs(ms);
      } else if (mode === "break") {
        setSelectedBreakMs(ms);
        setDisplayMs(ms);
      }
    },
    [runState, mode]
  );

  const start = useCallback(() => {
    if (runState !== "idle") return;
    if (mode === "countdown" || mode === "break") {
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
    } else if (mode === "break") {
      setDisplayMs(selectedBreakMs);
    } else {
      setDisplayMs(0);
    }
  }, [mode, selectedMs, selectedBreakMs]);

  const endStopwatch = useCallback(() => {
    if (runState !== "running" || mode !== "stopwatch") return;
    startAtRef.current = null;
    setRunState("stopped");
  }, [runState, mode]);

  const resetStopped = useCallback(() => {
    setRunState("idle");
    setDisplayMs(0);
  }, []);

  const actionBtnClass =
    "min-w-[100px] border border-black bg-transparent px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-black hover:text-white";

  const startBtnClass =
    "w-[140px] cursor-pointer border border-black bg-transparent px-6 py-3 text-sm font-semibold text-black transition-all duration-200 hover:bg-black hover:text-white hover:transition-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black";

  const presets =
    mode === "countdown" ? PRESETS : mode === "break" ? BREAK_PRESETS : null;
  const selectedDuration =
    mode === "countdown" ? selectedMs : mode === "break" ? selectedBreakMs : 0;

  return (
    <div className="relative h-full min-h-0 w-full">
      {/* Center: time + duration presets */}
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-6 px-6">
        <div className="text-5xl font-medium tabular-nums tracking-tight text-black md:text-6xl">
          {formatPlaygroundMs(displayMs)}
        </div>

        <div className="flex min-h-[48px] flex-wrap items-center justify-center gap-2">
          {presets &&
            runState === "idle" &&
            presets.map((p) => {
              const selected = durationsEqual(selectedDuration, p.ms);
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
      </div>

      {/* Top left: modes (wired) — matches desktop TimerView */}
      {runState === "idle" && (
        <div
          className={`absolute z-10 flex flex-col gap-2 ${EDGE.left} ${EDGE.top}`}
        >
          <button
            type="button"
            disabled={!canChangeMode}
            onClick={() => handleModeChange("countdown")}
            className={modeRowClass}
          >
            <KeyBox size="sm" selected={mode === "countdown"} hovered={false}>
              T
            </KeyBox>
            <span className="transition-colors duration-200 group-hover:text-black group-hover:transition-none">
              timer
            </span>
          </button>
          <button
            type="button"
            disabled={!canChangeMode}
            onClick={() => handleModeChange("stopwatch")}
            className={modeRowClass}
          >
            <KeyBox size="sm" selected={mode === "stopwatch"} hovered={false}>
              S
            </KeyBox>
            <span className="transition-colors duration-200 group-hover:text-black group-hover:transition-none">
              stopwatch
            </span>
          </button>
          <button
            type="button"
            disabled={!canChangeMode}
            onClick={() => handleModeChange("break")}
            className={modeRowClass}
          >
            <KeyBox size="sm" selected={mode === "break"} hovered={false}>
              B
            </KeyBox>
            <span className="transition-colors duration-200 group-hover:text-black group-hover:transition-none">
              break
            </span>
          </button>
        </div>
      )}

      {/* Top right: L + single label; click opens animated dropdown (playground only) */}
      {runState === "idle" && (
        <div
          className={`absolute z-10 max-w-[calc(100%-3rem)] ${EDGE.right} ${EDGE.topLabels}`}
        >
          <div ref={labelMenuRef} className="flex flex-col items-end">
            <button
              type="button"
              className="flex items-center gap-2 text-left"
              onClick={() => setLabelMenuOpen((o) => !o)}
              aria-expanded={labelMenuOpen}
            >
              <KeyBox size="sm" hovered={false}>
                L
              </KeyBox>
              <PlaygroundLabelTag
                name={PLAYGROUND_LABEL_PLACEHOLDERS[selectedLabelIdx].name}
                color={PLAYGROUND_LABEL_PLACEHOLDERS[selectedLabelIdx].color}
                selected
                uniformWidthClassName={LABEL_CHIP_WIDTH}
              />
            </button>
            <div
              className={`grid w-full min-w-0 transition-[grid-template-rows] duration-300 ease-out ${
                labelMenuOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="mt-1 flex flex-col items-end gap-1">
                  {PLAYGROUND_LABEL_PLACEHOLDERS.map((p, i) => (
                    <button
                      key={p.name}
                      type="button"
                      className="flex w-full items-center justify-end gap-2 text-left"
                      onClick={() => {
                        setSelectedLabelIdx(i);
                        setLabelMenuOpen(false);
                      }}
                    >
                      <KeyBox size="sm" hovered={false}>
                        {i === selectedLabelIdx ? "L" : i + 1}
                      </KeyBox>
                      <PlaygroundLabelTag
                        name={p.name}
                        color={p.color}
                        selected={i === selectedLabelIdx}
                        uniformWidthClassName={LABEL_CHIP_WIDTH}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom right: start (wired) */}
      {runState === "idle" && (
        <div className={`absolute z-10 ${EDGE.right} ${EDGE.bottom}`}>
          <button
            type="button"
            onClick={start}
            disabled={mode !== "stopwatch" && displayMs <= 0}
            className={startBtnClass}
          >
            start
          </button>
        </div>
      )}

      {runState === "running" && mode === "countdown" && (
        <div
          className={`absolute z-10 ${EDGE.right} ${EDGE.bottom}`}
        >
          <button type="button" onClick={cancel} className={actionBtnClass}>
            Cancel
          </button>
        </div>
      )}

      {runState === "running" && mode === "break" && (
        <div
          className={`absolute z-10 ${EDGE.right} ${EDGE.bottom}`}
        >
          <button type="button" onClick={cancel} className={actionBtnClass}>
            Cancel
          </button>
        </div>
      )}

      {runState === "running" && mode === "stopwatch" && (
        <div
          className={`absolute z-10 flex flex-wrap items-center justify-end gap-3 ${EDGE.right} ${EDGE.bottom}`}
        >
          <button type="button" onClick={endStopwatch} className={actionBtnClass}>
            End
          </button>
          <button type="button" onClick={cancel} className={actionBtnClass}>
            Cancel
          </button>
        </div>
      )}

      {runState === "stopped" && (
        <div
          className={`absolute z-10 ${EDGE.right} ${EDGE.bottom}`}
        >
          <button type="button" onClick={resetStopped} className={actionBtnClass}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
