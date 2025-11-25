import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { CaptureMetrics, MetricsSnapshot } from "@/types/metrics";

const MAX_CAPTURES = 20;

export function useMetrics() {
  const [recentCaptures, setRecentCaptures] = useState<CaptureMetrics[]>([]);
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unlisten = listen<CaptureMetrics>("sensing-metrics", (event) => {
      setRecentCaptures((prev) => {
        const updated = [...prev, event.payload];
        if (updated.length > MAX_CAPTURES) {
          return updated.slice(-MAX_CAPTURES);
        }
        return updated;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const refreshSnapshot = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await invoke<MetricsSnapshot>("get_metrics_snapshot");
      setSnapshot(data);
      if (data.recent_captures.length > 0) {
        setRecentCaptures(data.recent_captures);
      }
    } catch (err) {
      console.error("Failed to fetch metrics snapshot:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const lastCapture = recentCaptures.length > 0 
    ? recentCaptures[recentCaptures.length - 1] 
    : null;

  const stats = snapshot ? {
    captureCount: snapshot.capture_count,
    ocrCount: snapshot.ocr_count,
    ocrSkipCount: snapshot.ocr_skip_count,
    cpuPercent: snapshot.system.cpu_percent,
    memoryMb: snapshot.system.memory_mb,
  } : null;

  return {
    recentCaptures,
    lastCapture,
    snapshot,
    stats,
    isLoading,
    refreshSnapshot,
  };
}
