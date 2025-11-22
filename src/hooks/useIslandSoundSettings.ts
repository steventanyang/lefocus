import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ISLAND_SOUND_OPTIONS,
  IslandSoundSettings,
  IslandSoundSettingsWire,
  fromWire,
  toWire,
} from "@/types/island";

export function useIslandSoundSettings() {
  const [settings, setSettings] = useState<IslandSoundSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef<IslandSoundSettings | null>(null);

  const applySettings = useCallback((next: IslandSoundSettings) => {
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await invoke<IslandSoundSettingsWire>("get_island_sound_settings");
      applySettings(fromWire(payload));
    } catch (err) {
      console.error("Failed to load island sound settings", err);
      setError(`Failed to load settings: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    const unlistenPromise = listen<IslandSoundSettingsWire>(
      "island-sound-settings-updated",
      (event) => {
        applySettings(fromWire(event.payload));
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [applySettings]);

  const updateSettings = useCallback(
    async (next: IslandSoundSettings) => {
      const previous = settingsRef.current;
      applySettings(next);
      setIsSaving(true);
      setError(null);
      try {
        await invoke("set_island_sound_settings", {
          settings: toWire(next),
        });
      } catch (err) {
        console.error("Failed to update island sound settings", err);
        if (previous) {
          applySettings(previous);
        }
        setError(`Failed to update settings: ${err}`);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [applySettings]
  );

  const previewSound = useCallback(async (soundId: string) => {
    await invoke("preview_island_chime", { sound_id: soundId, soundId });
  }, []);

  const selectedSound = useMemo(() => {
    if (!settings) return null;
    return (
      ISLAND_SOUND_OPTIONS.find((option) => option.id === settings.soundId) ?? {
        id: settings.soundId,
        label: settings.soundId,
      }
    );
  }, [settings]);

  return {
    settings,
    selectedSound,
    isLoading,
    isSaving,
    error,
    setError,
    updateSettings,
    previewSound,
    refresh: fetchSettings,
    options: ISLAND_SOUND_OPTIONS,
  };
}
