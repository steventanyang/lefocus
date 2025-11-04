import type { TimerMode } from "@/types/timer";

interface ModeSelectorProps {
  selectedMode: TimerMode;
  onSelect: (mode: TimerMode) => void;
}

export function ModeSelector({ selectedMode, onSelect }: ModeSelectorProps) {
  const modes: { label: string; value: TimerMode }[] = [
    { label: "Timer", value: "countdown" },
    { label: "Stopwatch", value: "stopwatch" },
  ];

  return (
    <div className="flex flex-col gap-4 items-center w-full">
      <label className="text-sm font-light tracking-wide uppercase">Mode</label>
      <div className="flex gap-4 justify-center">
        {modes.map((mode) => {
          const isSelected = selectedMode === mode.value;
          return (
            <button
              key={mode.value}
              onClick={() => onSelect(mode.value)}
              className={
                isSelected
                  ? "bg-black border border-black text-white px-6 py-3 text-base font-semibold cursor-pointer transition-all duration-200"
                  : "bg-transparent border border-black text-black px-6 py-3 text-base font-normal cursor-pointer transition-all duration-200 hover:bg-black hover:text-white"
              }
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
