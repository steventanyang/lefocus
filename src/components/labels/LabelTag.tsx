import type { Label } from "@/types/label";

interface LabelTagProps {
  label: Label | null;
  size?: "small" | "medium";
}

export function LabelTag({ label, size = "medium" }: LabelTagProps) {
  const sizeClasses = {
    small: "px-2 py-0.5 text-xs",
    medium: "px-3 py-1 text-sm",
  };

  if (!label) {
    // No label - grey outline styling
    return (
      <div
        className={`inline-flex items-center rounded-full border border-gray-300 ${sizeClasses[size]} text-gray-400 font-medium`}
      >
        No Label
      </div>
    );
  }

  // Label exists - colored styling
  return (
    <div
      className={`inline-flex items-center rounded-full ${sizeClasses[size]} text-white font-medium`}
      style={{ backgroundColor: label.color }}
    >
      {label.name}
    </div>
  );
}
