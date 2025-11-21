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
  selected?: boolean;
}

export function KeyboardShortcut({ keyLetter, className = "", hovered = false, selected = false }: KeyboardShortcutProps) {
  const modifier = isMac() ? "⌘" : "Ctrl";
  const isMacPlatform = isMac();
  
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <KeyBox hovered={hovered} selected={selected} className={isMacPlatform ? "cmd-icon" : ""}>
        {modifier}
      </KeyBox>
      <KeyBox hovered={hovered} selected={selected}>
        {keyLetter.toUpperCase()}
      </KeyBox>
    </span>
  );
}

