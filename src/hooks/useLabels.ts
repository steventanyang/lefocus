import { useState, useEffect } from "react";
import { useLabelsQuery, useSessionsListInfinite } from "@/hooks/queries";
import type { Label } from "@/types/label";

const LAST_USED_LABEL_KEY = "lefocus_last_used_label_id";

/**
 * Custom hook for managing labels with localStorage persistence
 * - Fetches all labels from the backend
 * - Manages lastUsedLabelId state (persisted to localStorage)
 * - On mount: seeds lastUsedLabelId from the most recent session
 */
export function useLabels() {
  const { data: labels = [], isLoading, error } = useLabelsQuery();
  const { data: sessionsData } = useSessionsListInfinite();
  const [lastUsedLabelId, setLastUsedLabelIdState] = useState<number | null>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(LAST_USED_LABEL_KEY);
    return stored ? Number(stored) : null;
  });

  // On mount, seed lastUsedLabelId from most recent session if not already set
  useEffect(() => {
    if (lastUsedLabelId !== null) return; // Already has a value

    const sessions = sessionsData?.pages.flat() ?? [];
    if (sessions.length > 0) {
      const mostRecentSession = sessions[0]; // Already sorted by started_at DESC
      if (mostRecentSession.labelId) {
        console.log('[useLabels] Seeding lastUsedLabelId from most recent session:', mostRecentSession.labelId);
        setLastUsedLabelIdInternal(mostRecentSession.labelId);
      }
    }
  }, [sessionsData, lastUsedLabelId]);

  const setLastUsedLabelIdInternal = (id: number | null) => {
    setLastUsedLabelIdState(id);
    if (id === null) {
      localStorage.removeItem(LAST_USED_LABEL_KEY);
    } else {
      localStorage.setItem(LAST_USED_LABEL_KEY, String(id));
    }
  };

  // Find the label object for lastUsedLabelId
  const lastUsedLabel = labels.find(label => label.id === lastUsedLabelId) || null;

  return {
    labels,
    isLoading,
    error,
    lastUsedLabelId,
    lastUsedLabel,
    setLastUsedLabelId: setLastUsedLabelIdInternal,
  };
}

/**
 * Get a label by ID from the labels list
 */
export function useLabelById(labelId: number | null, labels: Label[]): Label | null {
  if (labelId === null) return null;
  return labels.find(label => label.id === labelId) || null;
}
