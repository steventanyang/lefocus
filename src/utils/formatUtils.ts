/**
 * Format duration in seconds to a human-readable string
 * @param seconds Duration in seconds
 * @returns Formatted duration string (e.g., "1h 30m 45s")
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours === 0 && mins === 0) return `${secs}s`;
  if (hours === 0 && secs === 0) return `${mins}m`;
  if (hours === 0) return `${mins}m ${secs}s`;
  if (mins === 0 && secs === 0) return `${hours}h`;
  if (mins === 0) return `${hours}h ${secs}s`;
  if (secs === 0) return `${hours}h ${mins}m`;
  return `${hours}h ${mins}m ${secs}s`;
}

/**
 * Convert hex color to rgba with opacity for light background
 * @param hex Hex color string (with or without #)
 * @param opacity Opacity value (0-1)
 * @returns RGBA color string
 */
export function hexToRgba(hex: string, opacity: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  // Handle both 3-digit and 6-digit hex
  const r = parseInt(cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Compare two durations with tolerance for floating point precision
 * @param duration1 First duration in milliseconds
 * @param duration2 Second duration in milliseconds
 * @param tolerance Tolerance in milliseconds (default: 100ms)
 * @returns True if durations are approximately equal
 */
export function areDurationsEqual(duration1: number, duration2: number, tolerance: number = 100): boolean {
  return Math.abs(duration1 - duration2) < tolerance;
}
