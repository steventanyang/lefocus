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
    <div className="duration-picker">
      {PRESETS.map((preset) => (
        <button
          key={preset.ms}
          onClick={() => onSelect(preset.ms)}
          className={selectedDuration === preset.ms ? "selected" : ""}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
