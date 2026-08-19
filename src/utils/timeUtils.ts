/** Convert a duration to the compact digits used by direct timer entry. */
export function msToClockDigits(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}${String(minutes).padStart(2, "0")}${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}${String(seconds).padStart(2, "0")}`;
}

/**
 * Interpret up to six right-aligned digits as HHMMSS and normalize carries.
 * Examples: "25" -> 25s, "2500" -> 25m, "9000" -> 1h30m.
 */
export function clockDigitsToMs(digits: string): number {
  const normalizedDigits = digits.replace(/\D/g, "").slice(-6);
  if (normalizedDigits.length === 0) return 0;

  const padded = normalizedDigits.padStart(6, "0");
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2, 4));
  const seconds = Number(padded.slice(4, 6));
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/** Format a duration as MM:SS, adding an hour group when needed. */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
