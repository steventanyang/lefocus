/**
 * Individual keyboard key box component
 * Displays a single key in a square box (e.g., ⌘, A, Ctrl, etc.)
 */
interface KeyBoxProps {
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
  hovered?: boolean;
}

export function KeyBox({ children, className = "", selected = false, hovered = false }: KeyBoxProps) {
  return (
    <span
      className={`text-xs border rounded w-5 h-5 flex items-center justify-center leading-none font-medium ${
        selected || hovered
          ? "bg-black text-white border-black" 
          : "text-gray-400 border-gray-400 group-hover:bg-black group-hover:text-white group-hover:border-black group-hover:transition-none transition-colors duration-200"
      } ${className}`}
      style={{ transform: 'translateY(-1px)' }}
    >
      {children}
    </span>
  );
}

