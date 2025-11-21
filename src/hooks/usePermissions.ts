import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface PermissionStatus {
  screenRecording: boolean;
  accessibility: boolean;
  loading: boolean;
  error: string | null;
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionStatus>({
    screenRecording: false,
    accessibility: false,
    loading: true,
    error: null,
  });

  const checkPermissions = useCallback(async () => {
    try {
      setPermissions(prev => ({ ...prev, loading: true, error: null }));
      
      const [screenRecording, accessibility] = await Promise.all([
        invoke<boolean>("check_screen_recording_permissions"),
        invoke<boolean>("check_accessibility_permissions"),
      ]);

      setPermissions({
        screenRecording,
        accessibility,
        loading: false,
        error: null,
      });
    } catch (err) {
      setPermissions(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const openScreenRecordingSettings = useCallback(async () => {
    try {
      await invoke("open_screen_recording_settings");
    } catch (err) {
      console.error("Failed to open screen recording settings:", err);
      throw err;
    }
  }, []);

  const openAccessibilitySettings = useCallback(async () => {
    try {
      await invoke("open_accessibility_settings");
    } catch (err) {
      console.error("Failed to open accessibility settings:", err);
      throw err;
    }
  }, []);

  // Check permissions on mount
  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  // Poll for permission changes every 2 seconds when needed
  useEffect(() => {
    // Only poll if some permissions are missing
    if (!permissions.loading && (!permissions.screenRecording || !permissions.accessibility)) {
      const interval = setInterval(checkPermissions, 2000);
      return () => clearInterval(interval);
    }
  }, [permissions.loading, permissions.screenRecording, permissions.accessibility, checkPermissions]);

  const allPermissionsGranted = permissions.screenRecording && permissions.accessibility;

  return {
    ...permissions,
    allPermissionsGranted,
    checkPermissions,
    openScreenRecordingSettings,
    openAccessibilitySettings,
  };
}
