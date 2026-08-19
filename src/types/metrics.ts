export interface CaptureMetrics {
  timestamp: string;
  metadata_ms: number;
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
}
