export function isMac(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}
