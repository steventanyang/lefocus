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

  // Label exists - dark background with white text
  return (
    <div
      className={`flex items-center justify-center border ${sizeClasses[size]} font-medium`}
      style={{
        backgroundColor: label.color,
        borderColor: label.color,
        color: 'white',
        width: '126px',
      }}
    >
      {label.name}
    </div>
  );
}
