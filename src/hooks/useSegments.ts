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
      stableDurationSecs: 0,
      transitioningDurationSecs: 0,
      distractedDurationSecs: 0,
      stablePercentage: 0,
      transitioningPercentage: 0,
      distractedPercentage: 0,
      segmentCount: 0,
      interruptionCount: 0,
    };
  }

  const stableDuration = segments
    .filter((s) => s.segmentType === "stable")
    .reduce((sum, s) => sum + s.durationSecs, 0);

  const transitioningDuration = segments
    .filter((s) => s.segmentType === "transitioning")
    .reduce((sum, s) => sum + s.durationSecs, 0);

  const distractedDuration = segments
    .filter((s) => s.segmentType === "distracted")
    .reduce((sum, s) => sum + s.durationSecs, 0);

  const totalDuration =
    stableDuration + transitioningDuration + distractedDuration;

  return {
    totalDurationSecs: totalDuration,
    stableDurationSecs: stableDuration,
    transitioningDurationSecs: transitioningDuration,
    distractedDurationSecs: distractedDuration,
    stablePercentage:
      totalDuration > 0 ? (stableDuration / totalDuration) * 100 : 0,
    transitioningPercentage:
      totalDuration > 0 ? (transitioningDuration / totalDuration) * 100 : 0,
    distractedPercentage:
      totalDuration > 0 ? (distractedDuration / totalDuration) * 100 : 0,
    segmentCount: segments.length,
    interruptionCount: 0, // Will be populated by parent component if needed
  };
}
