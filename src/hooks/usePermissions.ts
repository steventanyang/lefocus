import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface PermissionStatus {
  screenRecording: boolean;
  spotifyAutomation: boolean;
  loading: boolean;
  error: string | null;
  requestingSpotify: boolean;
}

interface PermissionsData {
  screenRecording: boolean;
  spotifyAutomation: boolean;
}

interface AutomationPermissionRequestResult {
  granted: boolean;
  status: number;
}

const OS_STATUS = {
  success: 0,
  procNotFound: -600,
  userCanceled: -128,
  errAEEventNotPermitted: -1743,
  errAEEventWouldRequireUserConsent: -1744,
} as const;

const describeAutomationStatus = (status: number, appName: string) => {
  switch (status) {
    case OS_STATUS.success:
      return null;
    case OS_STATUS.procNotFound:
      return `${appName} needs to be running before macOS can grant control. Please open ${appName} and try again.`;
    case OS_STATUS.errAEEventNotPermitted:
      return `macOS previously blocked LeFocus from controlling ${appName}. Open Automation settings and re-enable access for ${appName}.`;
    case OS_STATUS.errAEEventWouldRequireUserConsent:
      return `macOS needs to prompt you for ${appName}. Click Allow again with ${appName} in the foreground.`;
    case OS_STATUS.userCanceled:
      return "You dismissed the macOS permission dialog. Click Allow again to retry.";
    default:
      return `Permission request failed (code ${status}). Please open Automation settings and re-enable ${appName}.`;
  }
};

const PERMISSIONS_QUERY_KEY = ["permissions"];

async function fetchPermissions(): Promise<PermissionsData> {
  // Check screen recording permission
  let screenRecording = false;
  try {
    screenRecording = await Promise.race([
      invoke<boolean>("check_screen_recording_permissions"),
      new Promise<boolean>((_, reject) =>
        setTimeout(
          () => reject(new Error("Screen recording check timeout")),
          5000
        )
      ),
    ]);
    console.log("Screen recording permission check result:", screenRecording);
  } catch (err) {
    console.warn("Screen recording permission check failed:", err);
    screenRecording = false;
  }

  const spotifyAutomation = await invoke<boolean>(
    "check_media_automation_permission",
    { bundleId: "com.spotify.client" }
  ).catch((err) => {
    console.warn("Spotify automation permission check failed:", err);
    return false;
  });

  return { screenRecording, spotifyAutomation };
}

export function usePermissions() {
  const [isWaitingForScreenRecording, setIsWaitingForScreenRecording] =
    useState(false);
  const isWaitingRef = useRef(false);
  const [requestingSpotify, setRequestingSpotify] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use TanStack Query for polling
  const {
    data: permissionsData,
    isLoading,
    error: queryError,
  } = useQuery<PermissionsData>({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: fetchPermissions,
    // Poll every 1 second when waiting for screen recording, otherwise every 5 seconds
    refetchInterval: (query) => {
      const data = query.state.data;
      const allGranted = data?.screenRecording && data?.spotifyAutomation;

      // Stop polling if all permissions are granted
      if (allGranted) {
        return false;
      }

      // Aggressive polling when waiting for screen recording
      // Access ref directly (updated synchronously in event handlers)
      if (isWaitingRef.current && !data?.screenRecording) {
        return 1000; // 1 second
      }

      // Regular polling when permissions are missing
      return 5000; // 5 seconds
    },
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0, // Always consider stale to enable polling
  });

  const checkPermissions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PERMISSIONS_QUERY_KEY });
  }, [queryClient]);

  const openScreenRecordingSettings = useCallback(async () => {
    try {
      await invoke("open_screen_recording_settings");
      // Start aggressive polling after opening settings
      setIsWaitingForScreenRecording(true);
      isWaitingRef.current = true;
      // Stop aggressive polling after 30 seconds (fallback)
      setTimeout(() => {
        setIsWaitingForScreenRecording(false);
        isWaitingRef.current = false;
      }, 30000);
    } catch (err) {
      console.error("Failed to open screen recording settings:", err);
      setError(
        `Failed to open screen recording settings: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  const openAutomationSettings = useCallback(async () => {
    try {
      await invoke("open_automation_settings");
    } catch (err) {
      console.error("Failed to open automation settings:", err);
      setError(
        `Failed to open automation settings: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  const restartApp = useCallback(async () => {
    try {
      await invoke("restart_app_instance");
    } catch (err) {
      console.error("Failed to restart app:", err);
      setError(
        `Failed to restart app: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  const requestSpotifyAutomationPermission = useCallback(async () => {
    setRequestingSpotify(true);
    setError(null);
    try {
      console.log("Requesting Spotify automation permission...");
      const result = await invoke<AutomationPermissionRequestResult>(
        "request_media_automation_permission",
        {
          bundleId: "com.spotify.client",
        }
      );

      console.log("Spotify automation permission result", result);

      if (!result.granted) {
        const message = describeAutomationStatus(result.status, "Spotify");
        if (message) {
          setError(message);
        }

        if (result.status === OS_STATUS.errAEEventNotPermitted) {
          console.log(
            "Spotify automation previously denied; opening Automation settings for manual re-enable."
          );
          openAutomationSettings();
        }
      }
    } catch (err) {
      console.error("Failed to request Spotify automation permission:", err);
      setError(
        `Failed to request Spotify permission: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setRequestingSpotify(false);
      console.log(
        "Spotify automation permission flow complete, rechecking state..."
      );
      checkPermissions();
    }
  }, [checkPermissions, openAutomationSettings]);

  const screenRecording = permissionsData?.screenRecording ?? false;

  // Synchronize state with external system (macOS permission status)
  // This is valid because we're syncing with an external system, not deriving from props
  useEffect(() => {
    if (screenRecording && isWaitingForScreenRecording) {
      setIsWaitingForScreenRecording(false);
      isWaitingRef.current = false;
    }
  }, [screenRecording, isWaitingForScreenRecording]);
  const spotifyAutomation = permissionsData?.spotifyAutomation ?? false;
  const allPermissionsGranted = screenRecording && spotifyAutomation;

  // Combine query error with local error state
  const combinedError =
    error || (queryError instanceof Error ? queryError.message : null);

  return {
    screenRecording,
    spotifyAutomation,
    loading: isLoading,
    error: combinedError,
    requestingSpotify,
    allPermissionsGranted,
    checkPermissions,
    openScreenRecordingSettings,
    requestSpotifyAutomationPermission,
    openAutomationSettings,
    restartApp,
  };
}
