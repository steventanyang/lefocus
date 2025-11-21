import { KeyBox } from "@/components/ui/KeyBox";
import { isMac } from "@/utils/keyboardUtils";

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
  const modifier = isMac() ? "⌘" : "Ctrl";
  const isMacPlatform = isMac();
  
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <KeyBox hovered={hovered} className={isMacPlatform ? "cmd-icon" : ""}>
        {modifier}
      </KeyBox>
      <KeyBox hovered={hovered}>
        {keyLetter.toUpperCase()}
      </KeyBox>
    </span>
  );
}

