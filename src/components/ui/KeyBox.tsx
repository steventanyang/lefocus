/**
 * Individual keyboard key box component
 * Displays a single key in a square box (e.g., ⌘, A, Ctrl, etc.)
 */
interface KeyBoxProps {
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
}

export function KeyBox({ children, className = "", selected = false }: KeyBoxProps) {
  return (
    <span
      className={`text-xs border border-gray-400 rounded w-5 h-5 flex items-center justify-center leading-none font-medium ${
        selected 
          ? "bg-gray-600 text-white" 
          : "text-gray-600"
      } ${className}`}
    >
      {children}
    </span>
  );
}

