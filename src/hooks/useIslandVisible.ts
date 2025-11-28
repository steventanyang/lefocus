import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function useIslandVisible() {
  const [isVisible, setIsVisible] = useState<boolean | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVisibility = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const visible = await invoke<boolean>("get_island_visible");
      setIsVisible(visible);
    } catch (err) {
      console.error("Failed to load island visibility", err);
      setError(`Failed to load visibility: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVisibility();
  }, [fetchVisibility]);

  useEffect(() => {
    const unlistenPromise = listen<boolean>("island-visible-updated", (event) => {
      setIsVisible(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const updateVisibility = useCallback(async (visible: boolean) => {
    setIsSaving(true);
    setError(null);
    try {
      await invoke("set_island_visible", { visible });
      setIsVisible(visible);
    } catch (err) {
      console.error("Failed to update island visibility", err);
      setError(`Failed to update visibility: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    isVisible,
    isLoading,
    isSaving,
    error,
    updateVisibility,
  };
}

