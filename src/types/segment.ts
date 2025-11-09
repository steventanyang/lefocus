// Segment type definitions matching Rust backend

export interface Segment {
  id: string;
  sessionId: string;
  startTime: string; // ISO 8601 datetime
  endTime: string; // ISO 8601 datetime
  durationSecs: number;
  bundleId: string;
  appName: string | null;
  windowTitle: string | null;
  confidence: number;
  durationScore: number | null;
  stabilityScore: number | null;
  visualClarityScore: number | null;
  ocrQualityScore: number | null;
  readingCount: number;
  uniquePhashCount: number | null;
  segmentSummary: string | null;
  iconDataUrl?: string | null; // App icon from apps table (base64 PNG data URL)
}

export interface Interruption {
  id: string;
  segmentId: string;
  bundleId: string;
  appName: string | null;
  timestamp: string; // ISO 8601 datetime
  durationSecs: number;
}

export interface AppDuration {
  bundleId: string;
  appName: string | null;
  durationSecs: number;
  percentage: number;
  iconDataUrl?: string | null; // App icon from segments
}

export interface SegmentStats {
  totalDurationSecs: number;
  segmentCount: number;
  interruptionCount: number;
  topApps: AppDuration[];
}
