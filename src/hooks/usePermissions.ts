import { useState, useEffect, useCallback, useRef } from "react";
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

  const intervalRef = useRef<number | null>(null);
  const isCheckingRef = useRef<boolean>(false);

  const checkPermissions = useCallback(async () => {
    // Prevent multiple simultaneous checks
    if (isCheckingRef.current) {
      return;
    }

    try {
      isCheckingRef.current = true;
      setPermissions(prev => ({ ...prev, error: null }));
      
      // Check permissions individually with delays and error handling
      let screenRecording = false;
      let accessibility = false;
      
      try {
        screenRecording = await Promise.race([
          invoke<boolean>("check_screen_recording_permissions"),
          new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("Screen recording check timeout")), 5000))
        ]);
      } catch (err) {
        console.warn("Screen recording permission check failed:", err);
        screenRecording = false;
      }
      
      // Add delay between checks to prevent overwhelming Tauri
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        accessibility = await Promise.race([
          invoke<boolean>("check_accessibility_permissions"),
          new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("Accessibility check timeout")), 5000))
        ]);
      } catch (err) {
        console.warn("Accessibility permission check failed:", err);
        accessibility = false;
      }

      setPermissions(prev => ({
        ...prev,
        screenRecording,
        accessibility,
        loading: false,
      }));
    } catch (err) {
      console.error("Permission check failed:", err);
      setPermissions(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  const openScreenRecordingSettings = useCallback(async () => {
    try {
      await invoke("open_screen_recording_settings");
    } catch (err) {
      console.error("Failed to open screen recording settings:", err);
      setPermissions(prev => ({
        ...prev,
        error: `Failed to open screen recording settings: ${err instanceof Error ? err.message : String(err)}`
      }));
    }
  }, []);

  const openAccessibilitySettings = useCallback(async () => {
    try {
      await invoke("open_accessibility_settings");
    } catch (err) {
      console.error("Failed to open accessibility settings:", err);
      setPermissions(prev => ({
        ...prev,
        error: `Failed to open accessibility settings: ${err instanceof Error ? err.message : String(err)}`
      }));
    }
  }, []);

  // Check permissions on mount - but only once
  useEffect(() => {
    const initializePermissions = async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for app to fully load
      checkPermissions();
    };
    initializePermissions();
  }, []);

  // Set up a single polling interval
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    // Only poll if we're in development and need permissions
    const shouldPoll = !permissions.loading && 
                      (!permissions.screenRecording || !permissions.accessibility) && 
                      !permissions.error;

    if (shouldPoll) {
      intervalRef.current = window.setInterval(checkPermissions, 5000); // Increased to 5 seconds
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    permissions.loading, 
    permissions.screenRecording, 
    permissions.accessibility, 
    permissions.error
  ]);

  const allPermissionsGranted = permissions.screenRecording && permissions.accessibility;

  return {
    ...permissions,
    allPermissionsGranted,
    checkPermissions,
    openScreenRecordingSettings,
    openAccessibilitySettings,
  };
}
