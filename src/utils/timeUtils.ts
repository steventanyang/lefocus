/**
 * Convert milliseconds to 4-digit MMSS format
 * Example: 1500000ms (25 minutes) -> 2500
 */
export function msToMMSS(ms: number): number {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes * 100 + seconds;
}

/**
 * Convert 4-digit MMSS format to milliseconds
 * During input, we allow seconds > 59 to keep the display stable
 * Example: 2500 (25:00) -> 1500000ms
 * Example: 90 (00:90) -> 90000ms (not normalized to 01:30)
 */
export function mmssToMs(mmss: number): number {
  const minutes = Math.floor(mmss / 100);
  const seconds = mmss % 100;
  // Don't normalize seconds > 59 during input - keep raw value
  // This allows "90" to display as "00:90" instead of "01:30"
  return (minutes * 60 + seconds) * 1000;
}

/**
 * Format milliseconds as MM:SS or HH:MM:SS string
 * - MM:SS format when < 60 minutes (3600 seconds)
 * - HH:MM:SS format when >= 60 minutes
 * Example: 1500000ms -> "25:00"
 * Example: 3600000ms -> "1:00:00"
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  
  // Switch to HH:MM:SS format when >= 60 minutes (3600 seconds)
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format 4-digit MMSS number as MM:SS or HH:MM:SS string
 * - MM:SS format when < 60 minutes
 * - HH:MM:SS format when >= 60 minutes
 * Example: 2500 -> "25:00"
 * Example: 6000 -> "1:00:00" (60 minutes = 1 hour)
 */
export function formatEditableTime(mmss: number): string {
  const minutes = Math.floor(mmss / 100);
  const seconds = mmss % 100;
  
  // Switch to HH:MM:SS format when >= 60 minutes
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

