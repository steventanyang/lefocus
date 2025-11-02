import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionSummary } from "../types/timer";

interface UseSessionsListResult {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessionsList(): UseSessionsListResult {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<SessionSummary[]>("list_sessions");
      setSessions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await invoke<SessionSummary[]>("list_sessions");
        if (!cancelled) {
          setSessions(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch sessions"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    sessions,
    loading,
    error,
    refetch: fetchSessions,
  };
}
