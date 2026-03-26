interface KeyBoxProps {
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
  hovered?: boolean;
  selectedColor?: string;
  /** Smaller chip for playground chrome (T/S/B/L/numbers) */
  size?: "sm" | "md";
}

export function KeyBox({
  children,
  className = "",
  selected = false,
  hovered = false,
  selectedColor,
  size = "md",
}: KeyBoxProps) {
  const hasCustomColor = selected && selectedColor;
  const sizeClass =
    size === "sm"
      ? "h-4 w-4 text-[10px]"
      : "h-5 w-5 text-xs";

  return (
    <span
      className={`flex items-center justify-center rounded border font-medium leading-none ${sizeClass} ${
        hasCustomColor
          ? "text-white"
          : selected || hovered
            ? "border-gray-900 bg-gray-900 text-white"
            : "border-gray-300 text-gray-400 transition-colors duration-200 group-hover:border-gray-900 group-hover:bg-gray-900 group-hover:text-white group-hover:transition-none"
      } ${className}`}
      style={{
        transform: "translateY(-1px)",
        ...(hasCustomColor && {
          backgroundColor: selectedColor,
          borderColor: selectedColor,
        }),
      }}
    >
      {children}
    </span>
  );
}
