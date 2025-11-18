import type { Label } from "@/types/label";

interface LabelTagProps {
  label: Label | null;
  size?: "small" | "medium";
  selected?: boolean;
}

export function LabelTag({ label, size = "medium", selected = true }: LabelTagProps) {
  const sizeClasses = {
    small: "px-2 py-0.5 text-xs",
    medium: "px-3 py-1 text-sm",
  };

  if (!label) {
    // No label - grey border with transparent background
    return (
      <div
        className={`flex items-center justify-center border border-gray-300 ${sizeClasses[size]} text-gray-400 font-medium`}
        style={{ width: '126px', backgroundColor: 'transparent' }}
      >
        No Label
      </div>
    );
  }

  // Helper to convert hex to rgba for light backgrounds
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  const rgb = hexToRgb(label.color);
  const lightBg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : label.color;

  // Selected: dark background with white text
  // Unselected: light background with dark text (label color)
  return (
    <div
      className={`flex items-center justify-center border ${sizeClasses[size]} font-medium`}
      style={{
        backgroundColor: selected ? label.color : lightBg,
        borderColor: label.color,
        color: selected ? 'white' : label.color,
        width: '126px',
      }}
    >
      {label.name}
    </div>
  );
}
