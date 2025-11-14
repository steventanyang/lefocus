/**
 * TanStack Query hooks for LeFocus
 *
 * Query Key Structure:
 * - ['sessions'] - List of all sessions
 * - ['sessions', 'infinite'] - Paginated sessions list (infinite query)
 * - ['segments', sessionId] - Segments for a specific session
 * - ['interruptions', segmentId] - Interruptions for a specific segment
 * - ['windowTitles', segmentId] - Window titles for a specific segment
 */

import { useQuery, useMutation, useQueryClient, useQueries, useInfiniteQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { SessionSummary, SessionInfo } from "@/types/timer";
import type { Segment, Interruption, WindowTitleWithDuration } from "@/types/segment";

// ============================================================================
// QUERY HOOKS (Data Fetching)
// ============================================================================

/**
 * Fetch list of all sessions
 * @deprecated Use useSessionsListInfinite() for paginated loading instead.
 * This is kept for backward compatibility with StatsView which may need all sessions.
 * TODO: Consider migrating StatsView to use infinite query if performance becomes an issue.
 */
export function useSessionsList() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      console.log('[useSessionsList] Fetching sessions list...');
      const result = await invoke<SessionSummary[]>("list_sessions");
      console.log('[useSessionsList] Fetched sessions:', result.length, 'sessions');
      return result;
    },
    staleTime: 60_000, // Consider fresh for 1 minute (sessions don't change often)
  });
}

/**
 * Fetch paginated list of sessions with infinite scroll
 * Uses useInfiniteQuery for pagination with page size of 30
 */
export function useSessionsListInfinite() {
  const PAGE_SIZE = 30;
  
  return useInfiniteQuery({
    queryKey: ['sessions', 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam as number;
      console.log(`[useSessionsListInfinite] Fetching sessions page: offset=${offset}, limit=${PAGE_SIZE}`);
      const result = await invoke<SessionSummary[]>("list_sessions_paginated", {
        limit: PAGE_SIZE,
        offset,
      });
      console.log(`[useSessionsListInfinite] Fetched ${result.length} sessions (offset=${offset})`);
      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If the last page has fewer items than PAGE_SIZE, we've reached the end
      if (lastPage.length < PAGE_SIZE) {
        return undefined;
      }
      // Otherwise, return the next offset
      return allPages.length * PAGE_SIZE;
    },
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
    queryFn: async () => {
      console.log(`[useSegments] Fetching segments for session: ${sessionId}`);
      const result = await invoke<Segment[]>("get_segments_for_session", { sessionId });
      console.log(`[useSegments] Fetched ${result.length} segments for session: ${sessionId}`);
      return result;
    },
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
    queryFn: async () => {
      console.log(`[useInterruptions] Fetching interruptions for segment: ${segmentId}`);
      const result = await invoke<Interruption[]>("get_interruptions_for_segment", { segmentId });
      console.log(`[useInterruptions] Fetched ${result.length} interruptions for segment: ${segmentId}`);
      return result;
    },
    enabled: !!segmentId, // Only fetch when segmentId is provided
    staleTime: 300_000, // Consider fresh for 5 minutes (interruptions rarely change)
  });
}

/**
 * Fetch window titles for a specific segment with durations
 */
export function useWindowTitles(segmentId: string | null) {
  return useQuery({
    queryKey: ['windowTitles', segmentId],
    queryFn: async () => {
      console.log(`[useWindowTitles] Fetching window titles for segment: ${segmentId}`);
      const result = await invoke<[string, number][]>("get_window_titles_for_segment", { segmentId });
      const mapped = result.map(([title, durationSecs]) => ({ title, durationSecs })) as WindowTitleWithDuration[];
      console.log(`[useWindowTitles] Fetched ${mapped.length} window titles for segment: ${segmentId}`);
      return mapped;
    },
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
      queryFn: async () => {
        console.log(`[useSegmentsForSessions] Fetching segments for session: ${session.id}`);
        const result = await invoke<Segment[]>("get_segments_for_session", { sessionId: session.id });
        console.log(`[useSegmentsForSessions] Fetched ${result.length} segments for session: ${session.id}`);
        return result;
      },
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
      // Also invalidate infinite query
      queryClient.invalidateQueries({ queryKey: ['sessions', 'infinite'] });
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
