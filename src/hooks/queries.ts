/**
 * TanStack Query hooks for LeFocus
 *
 * Query Key Structure:
 * - ['sessions'] - List of all sessions
 * - ['segments', sessionId] - Segments for a specific session
 * - ['interruptions', segmentId] - Interruptions for a specific segment
 * - ['windowTitles', segmentId] - Window titles for a specific segment
 */

import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { SessionSummary, SessionInfo } from "@/types/timer";
import type { Segment, Interruption } from "@/types/segment";

// ============================================================================
// QUERY HOOKS (Data Fetching)
// ============================================================================

/**
 * Fetch list of all sessions
 * Replaces: useSessionsList hook
 */
export function useSessionsList() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => invoke<SessionSummary[]>("list_sessions"),
    staleTime: 60_000, // Consider fresh for 1 minute (sessions don't change often)
  });
}

/**
 * Fetch segments for a specific session
 * Replaces: useSegments hook
 */
export function useSegments(sessionId: string | null) {
  return useQuery({
    queryKey: ['segments', sessionId],
    queryFn: () => invoke<Segment[]>("get_segments_for_session", { sessionId }),
    enabled: !!sessionId, // Only fetch when sessionId is provided
    staleTime: 30_000, // Consider fresh for 30 seconds
  });
}

/**
 * Fetch interruptions for a specific segment
 * Replaces: useInterruptions hook
 */
export function useInterruptions(segmentId: string | null) {
  return useQuery({
    queryKey: ['interruptions', segmentId],
    queryFn: () => invoke<Interruption[]>("get_interruptions_for_segment", { segmentId }),
    enabled: !!segmentId, // Only fetch when segmentId is provided
    staleTime: 300_000, // Consider fresh for 5 minutes (interruptions rarely change)
  });
}

/**
 * Fetch window titles for a specific segment
 */
export function useWindowTitles(segmentId: string | null) {
  return useQuery({
    queryKey: ['windowTitles', segmentId],
    queryFn: () => invoke<string[]>("get_window_titles_for_segment", { segmentId }),
    enabled: !!segmentId, // Only fetch when segmentId is provided
    staleTime: 300_000, // Consider fresh for 5 minutes (window titles rarely change)
  });
}

/**
 * Fetch segments for multiple sessions in parallel
 * Automatically deduplicates requests and caches results
 * Replaces: Manual Promise.all in ActivitiesView
 */
export function useSegmentsForSessions(sessions: SessionSummary[]) {
  const queries = useQueries({
    queries: sessions.map((session) => ({
      queryKey: ['segments', session.id],
      queryFn: () => invoke<Segment[]>("get_segments_for_session", { sessionId: session.id }),
      staleTime: 30_000,
    })),
  });

  // Transform array of queries into a map
  const segmentsBySession: Record<string, Segment[]> = {};
  const isLoadingAny = queries.some(q => q.isLoading);
  const hasError = queries.some(q => q.error);

  queries.forEach((query, index) => {
    segmentsBySession[sessions[index].id] = query.data || [];
  });

  return {
    segmentsBySession,
    isLoading: isLoadingAny,
    hasError,
  };
}

// ============================================================================
// MUTATION HOOKS (State Changes)
// ============================================================================

/**
 * Start a timer session
 */
export function useStartTimerMutation() {
  return useMutation({
    mutationFn: (durationMs: number) => invoke("start_timer", { targetMs: durationMs }),
  });
}

/**
 * End a timer session
 * Automatically invalidates sessions query to refresh the list
 */
export function useEndTimerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => invoke<SessionInfo>("end_timer"),
    onSuccess: () => {
      // Invalidate sessions list so it refetches with the new session
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * Cancel a timer session
 */
export function useCancelTimerMutation() {
  return useMutation({
    mutationFn: () => invoke("cancel_timer"),
  });
}
