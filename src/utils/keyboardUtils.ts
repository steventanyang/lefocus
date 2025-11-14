/**
 * Check if user is currently typing in an input field
 */
export function isUserTyping(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toLowerCase();
  const isInput = tagName === "input";
  const isTextarea = tagName === "textarea";
  const isContentEditable =
    activeElement.getAttribute("contenteditable") === "true";

  return isInput || isTextarea || isContentEditable;
}

/**
 * Check if running on Mac (for Cmd vs Ctrl)
 */
export function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

