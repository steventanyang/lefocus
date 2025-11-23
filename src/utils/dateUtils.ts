/**
 * Date range utility functions for filtering segments by time windows
 */

import type { SessionSummary } from "@/types/timer";

export type TimeWindow = "day" | "week" | "month" | "year" | "custom";

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
 * Get the start and end of the current year
 */
export function getYearRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
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
    case "year":
      return getYearRange();
    default:
      return getDayRange(); // Fallback for custom
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
    case "year":
      return "This Year";
    case "custom":
      return "Custom Range";
  }
}

/**
 * Group sessions by day
 * Returns array of day groups sorted by date descending (today first)
 */
export interface DayGroup {
  date: Date;
  dateLabel: string;
  sessions: SessionSummary[];
}

export function groupSessionsByDay(sessions: SessionSummary[]): DayGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Group sessions by date (ignoring time)
  const sessionsByDate = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    const sessionDate = new Date(session.startedAt);
    const dateKey = new Date(
      sessionDate.getFullYear(),
      sessionDate.getMonth(),
      sessionDate.getDate()
    ).toISOString();

    if (!sessionsByDate.has(dateKey)) {
      sessionsByDate.set(dateKey, []);
    }
    sessionsByDate.get(dateKey)!.push(session);
  }

  // Convert to array and sort by date descending
  const dayGroups: DayGroup[] = Array.from(sessionsByDate.entries()).map(([dateKey, sessions]) => {
    const date = new Date(dateKey);
    let dateLabel: string;

    if (date.getTime() === today.getTime()) {
      dateLabel = "Today";
    } else if (date.getTime() === yesterday.getTime()) {
      dateLabel = "Yesterday";
    } else {
      // Format as "Nov 10" or "Nov 10, 2024" if different year
      dateLabel = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }

    return {
      date,
      dateLabel,
      sessions: sessions.sort((a, b) => 
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      ), // Sort sessions within day by time descending
    };
  });

  // Sort day groups by date descending (today first)
  return dayGroups.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Format date range for display with proper suffixes (1st, 2nd, 3rd, etc.)
 */
export function formatDateRange(timeWindow: TimeWindow): string {
  const { start, end } = getDateRangeForWindow(timeWindow);
  
  
  
  const formatDateNoYear = (date: Date) => {
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    const dayWithSuffix = day + (day === 1 || day === 21 || day === 31 ? 'st' : 
                                  day === 2 || day === 22 ? 'nd' : 
                                  day === 3 || day === 23 ? 'rd' : 'th');
    return `${month} ${dayWithSuffix}`;
  };
  
  // For single day (today), just show the date
  if (timeWindow === "day" && start.toDateString() === end.toDateString()) {
    return formatDateNoYear(start);
  }
  
  // For year, just show the year number
  if (timeWindow === "year") {
    return start.getFullYear().toString();
  }
  
  // For ranges, show "Month Day - Month Day" without years
  const startFormatted = formatDateNoYear(start);
  const endFormatted = formatDateNoYear(end);
  
  return `${startFormatted} - ${endFormatted}`;
}

/**
 * Parse date string in MM/DD/YYYY or MM/DD/YY format
 */
export function parseCustomDate(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  
  const month = parseInt(parts[0]) - 1; // JS months are 0-indexed
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  
  // Handle 2-digit year (e.g., 24 -> 2024)
  if (year < 100) {
    year += 2000;
  }
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  
  const date = new Date(year, month, day);
  return date;
}

/**
 * Validate MM/DD/YYYY or MM/DD/YY date string
 */
export function validateCustomDate(dateStr: string): boolean {
  const date = parseCustomDate(dateStr);
  return date !== null && !isNaN(date.getTime());
}

