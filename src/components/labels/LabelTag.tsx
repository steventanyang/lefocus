import type { Label } from "@/types/label";

interface LabelTagProps {
  label: Label | null;
  size?: "small" | "medium";
}

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function LabelTag({ label, size = "medium" }: LabelTagProps) {
  const sizeClasses = {
    small: "px-2 py-0.5 text-xs",
    medium: "px-3 py-1 text-sm",
  };

  if (!label) {
    // No label - grey styling matching status badges
    return (
      <div
        className={`inline-flex items-center justify-center border border-gray-300 ${sizeClasses[size]} bg-gray-100 text-gray-600 font-medium w-full`}
      >
        No Label
      </div>
    );
  }

  // Label exists - light background with dark text and border
  // Generate light background and dark border from label color
  const rgb = hexToRgb(label.color);
  const lightBg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : label.color;
  const darkBorder = label.color;
  const darkText = label.color;

  return (
    <div
      className={`inline-flex items-center justify-center border ${sizeClasses[size]} font-medium w-full`}
      style={{
        backgroundColor: lightBg,
        borderColor: darkBorder,
        color: darkText,
      }}
    >
      {label.name}
    </div>
  );
}
