// Segment type definitions matching Rust backend

export type SegmentType = "stable" | "transitioning" | "distracted";

export interface Segment {
  id: string;
  sessionId: string;
  startTime: string; // ISO 8601 datetime
  endTime: string; // ISO 8601 datetime
  durationSecs: number;
  bundleId: string;
  appName: string | null;
  windowTitle: string | null;
  segmentType: SegmentType;
  confidence: number;
  durationScore: number | null;
  stabilityScore: number | null;
  visualClarityScore: number | null;
  ocrQualityScore: number | null;
  readingCount: number;
  uniquePhashCount: number | null;
  segmentSummary: string | null;
}

export interface Interruption {
  id: string;
  segmentId: string;
  bundleId: string;
  appName: string | null;
  timestamp: string; // ISO 8601 datetime
  durationSecs: number;
}

export interface SegmentStats {
  totalDurationSecs: number;
  stableDurationSecs: number;
  transitioningDurationSecs: number;
  distractedDurationSecs: number;
  stablePercentage: number;
  transitioningPercentage: number;
  distractedPercentage: number;
  segmentCount: number;
  interruptionCount: number;
}
