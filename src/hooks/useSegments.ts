import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Segment, Interruption, SegmentStats } from "../types/segment";

export function useSegments(sessionId: string | null) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const loadSegments = useCallback(async () => {
    if (!sessionId) {
      setSegments([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const result = await invoke<Segment[]>("get_segments_for_session", {
        sessionId,
      });
      setSegments(result);
    } catch (err) {
      setError(`Failed to load segments: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const regenerateSegments = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError("");
      const result = await invoke<Segment[]>("regenerate_segments", {
        sessionId,
      });
      setSegments(result);
    } catch (err) {
      setError(`Failed to regenerate segments: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  return {
    segments,
    loading,
    error,
    regenerateSegments,
    reload: loadSegments,
  };
}

export function useInterruptions(segmentId: string | null) {
  const [interruptions, setInterruptions] = useState<Interruption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!segmentId) {
      setInterruptions([]);
      return;
    }

    const loadInterruptions = async () => {
      try {
        setLoading(true);
        setError("");
        const result = await invoke<Interruption[]>(
          "get_interruptions_for_segment",
          { segmentId }
        );
        setInterruptions(result);
      } catch (err) {
        setError(`Failed to load interruptions: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    loadInterruptions();
  }, [segmentId]);

  return { interruptions, loading, error };
}

export function calculateSegmentStats(segments: Segment[]): SegmentStats {
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
  const appDurations = new Map<string, { bundleId: string; appName: string | null; durationSecs: number }>();

  for (const segment of segments) {
    const existing = appDurations.get(segment.bundleId);
    if (existing) {
      existing.durationSecs += segment.durationSecs;
    } else {
      appDurations.set(segment.bundleId, {
        bundleId: segment.bundleId,
        appName: segment.appName,
        durationSecs: segment.durationSecs,
      });
    }
  }

  // Sort by duration and take top apps
  const topApps = Array.from(appDurations.values())
    .sort((a, b) => b.durationSecs - a.durationSecs)
    .slice(0, 5)
    .map(app => ({
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
