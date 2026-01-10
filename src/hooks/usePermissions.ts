import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

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

const SPOTIFY_PERMISSION_QUERY_KEY = ["spotify-permission"];

async function fetchSpotifyPermission(): Promise<boolean> {
  return invoke<boolean>("check_media_automation_permission", {
    bundleId: "com.spotify.client",
  }).catch((err) => {
    console.warn("Spotify automation permission check failed:", err);
    return false;
  });
}

/**
 * Hook for Spotify automation permission management.
 * Note: Spotify permission is also requested lazily by Swift MediaMonitor when Spotify is detected.
 * This hook is useful for manual permission management in settings.
 */
export function useSpotifyPermission() {
  const [requestingSpotify, setRequestingSpotify] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: spotifyAutomation,
    isLoading: loading,
    error: queryError,
  } = useQuery<boolean>({
    queryKey: SPOTIFY_PERMISSION_QUERY_KEY,
    queryFn: fetchSpotifyPermission,
    refetchInterval: (query) => {
      // Stop polling if permission is granted
      if (query.state.data === true) {
        return false;
      }
      return 5000; // Poll every 5 seconds
    },
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
  });

  const checkPermissions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SPOTIFY_PERMISSION_QUERY_KEY });
  }, [queryClient]);

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

  const combinedError =
    error || (queryError instanceof Error ? queryError.message : null);

  return {
    spotifyAutomation: spotifyAutomation ?? false,
    loading,
    error: combinedError,
    requestingSpotify,
    checkPermissions,
    requestSpotifyAutomationPermission,
    openAutomationSettings,
  };
}
