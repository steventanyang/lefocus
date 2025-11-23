import { TIMER_PRESETS_MS } from "@/constants/timer";
import { areDurationsEqual } from "@/utils/formatUtils";

interface DurationPickerProps {
  onSelect: (durationMs: number) => void;
  selectedDuration: number | null;
}

export const PRESETS = [
  { label: "25 m", ms: TIMER_PRESETS_MS.POMODORO },
  { label: "45 m", ms: TIMER_PRESETS_MS.FOCUS_45 },
  { label: "90 m", ms: 90 * 60 * 1000 },
];

export function DurationPicker({ onSelect, selectedDuration }: DurationPickerProps) {
  return (
    <div className="flex gap-4 justify-center">
      {PRESETS.map((preset) => {
        const isSelected = selectedDuration !== null && areDurationsEqual(selectedDuration, preset.ms);
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
