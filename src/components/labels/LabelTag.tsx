import type { Label } from "@/types/label";

interface LabelTagProps {
  label: Label | null;
  size?: "small" | "medium";
  selected?: boolean;
  maxWidth?: string;
  showEmptyFrame?: boolean;
  emptyText?: string;
}

export function LabelTag({
  label,
  size = "medium",
  selected = true,
  maxWidth,
  showEmptyFrame = true,
  emptyText = "no label",
}: LabelTagProps) {
  const sizeClasses = {
    small: "px-2 py-1 text-xs leading-tight",
    medium: "px-3 py-1 text-sm leading-tight",
  } as const;

  if (!label) {
    const baseContent = (
      <span className={`${maxWidth ? 'truncate inline-block max-w-full text-left' : ''} text-black font-light`}>
        {emptyText}
      </span>
    );

    const content = (
      <div
        className={`flex items-center justify-center ${maxWidth ? 'min-w-0' : ''} ${sizeClasses[size]}`}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {baseContent}
      </div>
    );

    if (!showEmptyFrame) {
      return content;
    }

    return (
      <div
        className={
          `flex items-center justify-center ${maxWidth ? 'min-w-0' : ''} border border-gray-300 ${sizeClasses[size]}`
        }
        style={{ backgroundColor: 'transparent', ...(maxWidth && { maxWidth }) }}
      >
        {baseContent}
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
      className={`flex items-center justify-center ${maxWidth ? 'min-w-0' : ''} border ${sizeClasses[size]} font-medium`}
      style={{
        backgroundColor: selected ? label.color : lightBg,
        borderColor: label.color,
        color: selected ? 'white' : label.color,
        ...(maxWidth && { maxWidth }),
      }}
    >
      <span className={maxWidth ? 'truncate inline-block max-w-full text-left' : ''}>
        {label.name}
      </span>
    </div>
  );
}
