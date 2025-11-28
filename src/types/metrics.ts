export interface CaptureMetrics {
  timestamp: string;
  metadata_ms: number;
  screenshot_ms: number;
  screenshot_bytes: number;
  phash_ms: number;
  ocr_ms: number | null;
  ocr_skipped_reason: string | null;
  db_write_ms: number;
  total_ms: number;
  cpu_percent: number;
  memory_mb: number;
}

export interface SystemMetrics {
  cpu_percent: number;
  memory_mb: number;
}

export interface MetricsSnapshot {
  system: SystemMetrics;
  recent_captures: CaptureMetrics[];
  capture_count: number;
  ocr_count: number;
  ocr_skip_count: number;
}
