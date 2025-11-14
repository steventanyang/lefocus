import { KeyBox } from "@/components/ui/KeyBox";

/**
 * Keyboard shortcut icon component
 * Displays a keyboard shortcut like ⌘A or Ctrl+A
 */
interface KeyboardShortcutProps {
  keyLetter: string;
  className?: string;
  hovered?: boolean;
}

export function KeyboardShortcut({ keyLetter, className = "", hovered = false }: KeyboardShortcutProps) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifier = isMac ? "⌘" : "Ctrl";
  
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <KeyBox hovered={hovered} className={isMac ? "cmd-icon" : ""}>
        {modifier}
      </KeyBox>
      <KeyBox hovered={hovered}>
        {keyLetter.toUpperCase()}
      </KeyBox>
    </span>
  );
}

