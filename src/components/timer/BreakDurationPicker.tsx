import { TIMER_PRESETS_MS } from "@/constants/timer";

interface BreakDurationPickerProps {
  onSelect: (durationMs: number) => void;
  selectedDuration: number | null;
}

export const BREAK_PRESETS = [
  { label: "5 m", ms: TIMER_PRESETS_MS.SHORT_BREAK },
  { label: "10 m", ms: 10 * 60 * 1000 },
  { label: "15 m", ms: TIMER_PRESETS_MS.LONG_BREAK },
];

export function BreakDurationPicker({ onSelect, selectedDuration }: BreakDurationPickerProps) {
  return (
    <div className="flex gap-4 justify-center">
      {BREAK_PRESETS.map((preset) => {
        // Compare with small tolerance to handle any rounding differences
        const isSelected = selectedDuration !== null && Math.abs(selectedDuration - preset.ms) < 100;
        return (
          <button
            key={preset.ms}
            onClick={(e) => {
              e.currentTarget.blur(); // Remove focus after click
              onSelect(preset.ms);
            }}
            className={
              isSelected
                ? "bg-black text-white px-6 py-3 text-base font-semibold cursor-pointer transition-all duration-200"
                : "bg-transparent border border-transparent text-black px-6 py-3 text-base font-semibold cursor-pointer transition-all duration-200 hover:border-black"
            }
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

