import { KeyBox } from "@/components/ui/KeyBox";

/**
 * Keyboard shortcut icon component
 * Displays a keyboard shortcut like ⌘A or Ctrl+A
 */
interface KeyboardShortcutProps {
  keyLetter: string;
  className?: string;
}

export function KeyboardShortcut({ keyLetter, className = "" }: KeyboardShortcutProps) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifier = isMac ? "⌘" : "Ctrl";
  
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <KeyBox className="text-gray-600 font-medium">
        {modifier}
      </KeyBox>
      <KeyBox className="text-gray-600 font-medium">
        {keyLetter.toUpperCase()}
      </KeyBox>
    </span>
  );
}

