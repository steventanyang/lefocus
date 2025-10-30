interface DurationPickerProps {
  onSelect: (durationMs: number) => void;
  selectedDuration: number | null;
}

const PRESETS = [
  { label: "30 sec", ms: 30 * 1000 },
  { label: "1 min", ms: 1 * 60 * 1000 },
  { label: "15 min", ms: 15 * 60 * 1000 },
  { label: "25 min", ms: 25 * 60 * 1000 },
  { label: "45 min", ms: 45 * 60 * 1000 },
];

export function DurationPicker({ onSelect, selectedDuration }: DurationPickerProps) {
  return (
    <div className="flex gap-4 justify-center">
      {PRESETS.map((preset) => (
        <button
          key={preset.ms}
          onClick={() => onSelect(preset.ms)}
          className={`bg-transparent border border-black text-black px-6 py-3 text-base font-normal cursor-pointer transition-all duration-200 hover:bg-black hover:text-white ${
            selectedDuration === preset.ms
              ? "bg-black text-white font-semibold"
              : ""
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
