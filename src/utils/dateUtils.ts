/**
 * Date range utility functions for filtering segments by time windows
 */

export type TimeWindow = "day" | "week" | "month";

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Get the start and end of today (start of day to end of day)
 */
export function getDayRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

/**
 * Get the start and end of the current week (Monday to Sunday)
 */
export function getWeekRange(): DateRange {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  
  const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Get the start and end of the current month
 */
export function getMonthRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Get date range for a given time window
 */
export function getDateRangeForWindow(window: TimeWindow): DateRange {
  switch (window) {
    case "day":
      return getDayRange();
    case "week":
      return getWeekRange();
    case "month":
      return getMonthRange();
  }
}

/**
 * Check if a date string (ISO 8601) falls within a date range
 */
export function isDateInRange(dateString: string, range: DateRange): boolean {
  const date = new Date(dateString);
  return date >= range.start && date <= range.end;
}

/**
 * Get a human-readable label for a time window
 */
export function getTimeWindowLabel(window: TimeWindow): string {
  switch (window) {
    case "day":
      return "Today";
    case "week":
      return "This Week";
    case "month":
      return "This Month";
  }
}

