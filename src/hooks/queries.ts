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
import type { Label, LabelInput } from "@/types/label";

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

interface AppDetailsResponse {
  window_titles: Array<[string, number]>;
}

/**
 * Fetch aggregated details (window titles) for an app in a time range
 */
export function useAppDetails(
  bundleId: string | null,
  startTime: string | undefined, // ISO string
  endTime: string | undefined    // ISO string
) {
  return useQuery({
    queryKey: ['appDetails', bundleId, startTime, endTime],
    queryFn: async () => {
      if (!bundleId || !startTime || !endTime) return null;

      console.log(`[useAppDetails] Fetching details for app: ${bundleId} from ${startTime} to ${endTime}`);
      const result = await invoke<AppDetailsResponse>("get_app_details_in_time_range", {
        bundleId,
        startTime,
        endTime,
      });
      
      // Map window titles to object format to match other hooks
      const mappedWindowTitles = result.window_titles.map(([title, durationSecs]) => ({ 
        title, 
        durationSecs 
      })) as WindowTitleWithDuration[];

      console.log(`[useAppDetails] Fetched details for app: ${bundleId}`);
      return {
        windowTitles: mappedWindowTitles,
      };
    },
    enabled: !!bundleId && !!startTime && !!endTime,
    staleTime: 60_000, // Cache for 1 minute
  });
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

// ============================================================================
// LABEL QUERY HOOKS
// ============================================================================

/**
 * Fetch all labels (non-deleted, ordered by orderIndex)
 */
export function useLabelsQuery() {
  return useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      console.log('[useLabelsQuery] Fetching labels...');
      const result = await invoke<Label[]>("get_labels");
      console.log('[useLabelsQuery] Fetched labels:', result.length, 'labels');
      return result;
    },
    staleTime: 300_000, // Consider fresh for 5 minutes (labels don't change often)
  });
}

/**
 * Create a new label
 * Automatically invalidates labels query to refresh the list
 */
export function useCreateLabelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LabelInput) => invoke<Label>("create_label", { input }),
    onSuccess: () => {
      // Invalidate labels list to refetch
      queryClient.invalidateQueries({ queryKey: ['labels'] });
    },
  });
}

/**
 * Update an existing label
 * Automatically updates the label in the cache
 */
export function useUpdateLabelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labelId, name, color }: { labelId: number; name?: string; color?: string }) =>
      invoke<Label>("update_label", { labelId, name, color }),
    onSuccess: (updatedLabel) => {
      // Update the label in the cache
      queryClient.setQueryData<Label[]>(['labels'], (old) => {
        if (!old) return old;
        return old.map(label => label.id === updatedLabel.id ? updatedLabel : label);
      });
    },
  });
}

/**
 * Delete a label (soft delete)
 * Automatically invalidates labels and sessions queries
 */
export function useDeleteLabelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (labelId: number) => invoke<void>("delete_label", { labelId }),
    onSuccess: () => {
      // Invalidate labels list
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      // Invalidate sessions since their labelId may have been set to null
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'infinite'] });
    },
  });
}

/**
 * Update a session's label
 * Automatically invalidates sessions queries
 */
export function useUpdateSessionLabelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, labelId }: { sessionId: string; labelId: number | null }) =>
      invoke<void>("update_session_label", { sessionId, labelId }),
    onSuccess: () => {
      // Invalidate sessions to refetch with updated label
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'infinite'] });
    },
  });
}

/**
 * Delete a session
 * Automatically invalidates sessions queries
 */
export function useDeleteSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => invoke<void>("delete_session", { sessionId }),
    onSuccess: () => {
      // Invalidate sessions to refetch (removing the deleted session)
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'infinite'] });
    },
  });
}
