/**
 * Utility functions for segment data processing
 *
 * Note: Data fetching hooks have been moved to @/hooks/queries.ts (TanStack Query)
 * This file now only contains pure utility functions.
 */

import { Segment, SegmentStats } from "@/types/segment";

/**
 * Calculate aggregate statistics from an array of segments
 * Used by SessionResults component to display session summary
 * @param segments - Array of segments to calculate stats from
 * @param limit - Optional limit for number of apps to return. Pass undefined to return all apps.
 */
export function calculateSegmentStats(segments: Segment[], limit?: number): SegmentStats {
  if (segments.length === 0) {
    return {
      totalDurationSecs: 0,
      segmentCount: 0,
      interruptionCount: 0,
      topApps: [],
    };
  }

  const totalDuration = segments.reduce(
    (sum, s) => sum + s.durationSecs,
    0
  );

  // Group segments by app
  const appDurations = new Map<string, { bundleId: string; appName: string | null; durationSecs: number; iconDataUrl?: string | null; iconColor?: string | null }>();

  for (const segment of segments) {
    const existing = appDurations.get(segment.bundleId);
    if (existing) {
      existing.durationSecs += segment.durationSecs;
      // Keep first non-null iconDataUrl we encounter
      if (!existing.iconDataUrl && segment.iconDataUrl) {
        existing.iconDataUrl = segment.iconDataUrl;
      }
      // Keep first non-null iconColor we encounter
      if (!existing.iconColor && segment.iconColor) {
        existing.iconColor = segment.iconColor;
      }
    } else {
      appDurations.set(segment.bundleId, {
        bundleId: segment.bundleId,
        appName: segment.appName,
        durationSecs: segment.durationSecs,
        iconDataUrl: segment.iconDataUrl,
        iconColor: segment.iconColor,
      });
    }
  }

  // Sort by duration
  let sortedApps = Array.from(appDurations.values())
    .sort((a, b) => b.durationSecs - a.durationSecs);

  // Apply limit: if limit is undefined, return all apps; otherwise use the limit
  if (limit !== undefined) {
    sortedApps = sortedApps.slice(0, limit);
  }

  const topApps = sortedApps.map(app => ({
    ...app,
    percentage: totalDuration > 0 ? (app.durationSecs / totalDuration) * 100 : 0,
  }));

  return {
    totalDurationSecs: totalDuration,
    segmentCount: segments.length,
    interruptionCount: 0, // Will be populated by parent component if needed
    topApps,
  };
}
