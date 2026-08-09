import { useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useSpotifyPermission } from "@/hooks/usePermissions";
import { useIslandAgentTracking } from "@/hooks/useIslandAgentTracking";
import { useIslandVisible } from "@/hooks/useIslandVisible";

function ToggleSwitch({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`w-24 px-4 py-2 text-sm font-normal border transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 ${
        enabled
          ? "bg-green-100 border-green-500 text-green-800"
          : "bg-white border-black text-black"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-opacity-90"}`}
    >
      {enabled ? "enabled" : "disabled"}
    </button>
  );
}

export function SettingsSettingsPage() {
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  const {
    spotifyAutomation,
    loading,
    requestSpotifyAutomationPermission,
    requestingSpotify,
  } = useSpotifyPermission();

  const {
    isVisible,
    isLoading: isLoadingVisibility,
    updateVisibility,
  } = useIslandVisible();

  const {
    agentTrackingEnabled,
    isLoading: isLoadingAgentTracking,
    updateAgentTracking,
  } = useIslandAgentTracking();

  async function handleCheckForUpdates() {
    setUpdateMessage(null);
    setUpdateBusy(true);
    try {
      const update = await check();
      if (!update) {
        setUpdateMessage("You're on the latest version.");
        return;
      }
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUpdateMessage(msg);
    } finally {
      setUpdateBusy(false);
    }
  }

  return (
    <div>
      {/* Updates */}
      <div className="mb-8">
        <h2 className="text-base font-normal tracking-wide text-gray-800 mb-4">
          updates
        </h2>
        <div className="flex flex-col gap-6 max-w-2xl">
          <div className="border-[0.5px] border-black p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                <h3 className="text-sm font-semibold">check for updates</h3>
                {updateMessage ? (
                  <span
                    className={`text-xs font-normal leading-snug ${
                      updateMessage.includes("latest")
                        ? "text-emerald-900"
                        : "text-red-800"
                    }`}
                  >
                    {updateMessage}
                  </span>
                ) : null}
              </div>
              <p className="text-xs font-light text-gray-600">
                Fetches the latest build, installs it, and restarts the app.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCheckForUpdates}
              disabled={updateBusy}
              className={`shrink-0 bg-transparent border border-black text-black px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200 whitespace-nowrap ${
                updateBusy ? "bg-gray-100 text-gray-400 cursor-wait" : ""
              }`}
            >
              {updateBusy ? "checking…" : "check"}
            </button>
          </div>
        </div>
      </div>

      {/* Permissions Section */}
      <div className="mb-8">
        <h2 className="text-base font-normal tracking-wide text-gray-800 mb-4">
          permissions
        </h2>
        <div className="flex flex-col gap-6 max-w-2xl">
          <div className="border-[0.5px] border-black p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-sm font-semibold">spotify controls</h3>
                {spotifyAutomation ? (
                  <span className="text-xs px-2 py-0.5 border bg-green-100 text-green-800 border-green-500 font-normal whitespace-nowrap">
                    granted
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 border bg-amber-100 text-amber-800 border-amber-300 font-normal whitespace-nowrap">
                    optional
                  </span>
                )}
              </div>
              <p className="text-xs font-light text-gray-600">
                Enable track detection and controls for the Dynamic Island
              </p>
            </div>
            {spotifyAutomation ? (
              <div className="bg-green-100 border border-green-500 text-green-800 px-4 py-2 flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            ) : (
              <button
                type="button"
                onClick={requestSpotifyAutomationPermission}
                disabled={requestingSpotify}
                className={`bg-transparent border border-black text-black px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200 whitespace-nowrap ${
                  requestingSpotify ? "bg-gray-100 text-gray-400 cursor-wait" : ""
                }`}
              >
                {requestingSpotify ? "waiting..." : loading ? "checking…" : "allow"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Control Panel Section */}
      <div>
        <h2 className="text-base font-normal tracking-wide text-gray-800 mb-4">
          control panel
        </h2>
        <div className="flex flex-col gap-6 max-w-2xl">
          <div className="border-[0.5px] border-black p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold mb-1">dynamic island</h3>
              <p className="text-xs font-light text-gray-600">
                Show or hide the Dynamic Island timer display
              </p>
            </div>
            <ToggleSwitch
              enabled={isVisible ?? false}
              onChange={updateVisibility}
              disabled={isLoadingVisibility || isVisible === undefined}
            />
          </div>

          <div className="border-[0.5px] border-black p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold mb-1">agent terminal tracking</h3>
              <p className="text-xs font-light text-gray-600">
                Tracking for agent sessions on the island.
              </p>
            </div>
            <ToggleSwitch
              enabled={agentTrackingEnabled ?? false}
              onChange={updateAgentTracking}
              disabled={isLoadingAgentTracking || agentTrackingEnabled === undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
