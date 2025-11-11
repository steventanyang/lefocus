interface BreakDurationPickerProps {
  onSelect: (durationMs: number) => void;
  selectedDuration: number | null;
}

const BREAK_PRESETS = [
  { label: "30 sec", ms: 30 * 1000 },
  { label: "5 min", ms: 5 * 60 * 1000 },
  { label: "10 min", ms: 10 * 60 * 1000 },
  { label: "15 min", ms: 15 * 60 * 1000 },
];

export function BreakDurationPicker({ onSelect, selectedDuration }: BreakDurationPickerProps) {
  return (
    <div className="flex gap-4 justify-center">
      {BREAK_PRESETS.map((preset) => {
        const isSelected = selectedDuration === preset.ms;
        return (
          <button
            key={preset.ms}
            onClick={() => onSelect(preset.ms)}
            className={
              isSelected
                ? "bg-black border border-black text-white px-6 py-3 text-base font-semibold cursor-pointer transition-all duration-200"
                : "bg-transparent border border-black text-black px-6 py-3 text-base font-normal cursor-pointer transition-all duration-200 hover:bg-black hover:text-white"
            }
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

