/**
 * Visual parity with desktop `LabelTag` — label chips with border + label color.
 * Playground-only; no backend.
 */
interface PlaygroundLabelTagProps {
  name: string;
  color: string;
  /** Mirrors app: selected = solid fill, unselected = light tint */
  selected?: boolean;
  maxWidth?: string;
  /** e.g. `w-[8.25rem] shrink-0` so all chips match width */
  uniformWidthClassName?: string;
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function PlaygroundLabelTag({
  name,
  color,
  selected = true,
  maxWidth,
  uniformWidthClassName,
}: PlaygroundLabelTagProps) {
  const sizeClasses = "px-2 py-0.5 text-xs leading-tight font-medium";
  const rgb = hexToRgb(color);
  const lightBg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)` : color;

  return (
    <div
      className={`flex min-w-0 items-center justify-center border ${sizeClasses}${
        uniformWidthClassName ? ` ${uniformWidthClassName}` : ""
      }`}
      style={{
        backgroundColor: selected ? color : lightBg,
        borderColor: color,
        color: selected ? "#f5f4f1" : color,
        ...(maxWidth && { maxWidth }),
      }}
    >
      <span
        className={
          maxWidth
            ? "inline-block max-w-full truncate text-left"
            : "inline-block w-full truncate text-center"
        }
      >
        {name}
      </span>
    </div>
  );
}
