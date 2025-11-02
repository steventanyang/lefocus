import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Segment, Interruption, SegmentStats } from "../types/segment";

export function useSegments(sessionId: string | null) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!sessionId) {
      setSegments([]);
      return;
    }

    let cancelled = false;

    const loadSegments = async () => {
      try {
        setLoading(true);
        setError("");
        const result = await invoke<Segment[]>("get_segments_for_session", {
          sessionId,
        });
        if (!cancelled) {
          setSegments(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to load segments: ${err}`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSegments();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const reload = useCallback(async () => {
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

  return {
    segments,
    loading,
    error,
    reload,
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

    let cancelled = false;

    const loadInterruptions = async () => {
      try {
        setLoading(true);
        setError("");
        const result = await invoke<Interruption[]>(
          "get_interruptions_for_segment",
          { segmentId }
        );
        if (!cancelled) {
          setInterruptions(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to load interruptions: ${err}`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInterruptions();

    return () => {
      cancelled = true;
    };
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
