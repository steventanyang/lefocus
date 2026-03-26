import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Whether Claude / agent terminal session dots appear on the Dynamic Island. */
export function useIslandAgentTracking() {
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEnabled = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const value = await invoke<boolean>("get_island_agent_tracking");
      setEnabled(value);
    } catch (err) {
      console.error("Failed to load island agent tracking", err);
      setError(`Failed to load: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnabled();
  }, [fetchEnabled]);

  useEffect(() => {
    const unlistenPromise = listen<boolean>("island-agent-tracking-updated", (event) => {
      setEnabled(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const updateAgentTracking = useCallback(async (next: boolean) => {
    setIsSaving(true);
    setError(null);
    try {
      await invoke("set_island_agent_tracking", { enabled: next });
      setEnabled(next);
    } catch (err) {
      console.error("Failed to update island agent tracking", err);
      setError(`Failed to update: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    agentTrackingEnabled: enabled,
    isLoading,
    isSaving,
    error,
    updateAgentTracking,
  };
}
