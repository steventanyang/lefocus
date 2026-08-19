import { useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
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
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);

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
      if (availableUpdate) {
        await availableUpdate.downloadAndInstall();
        await relaunch();
        return;
      }

      const update = await check();
      if (!update) {
        setUpdateMessage("You're on the latest version.");
        return;
      }
      setAvailableUpdate(update);
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
                {availableUpdate
                  ? "A new version is ready to download and install."
                  : "Check for a new version before choosing whether to install it."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCheckForUpdates}
              disabled={updateBusy}
              className={`shrink-0 border border-black px-4 py-2 text-sm font-semibold cursor-pointer transition-all duration-200 whitespace-nowrap ${
                updateBusy
                  ? "bg-gray-100 text-gray-400 cursor-wait"
                  : availableUpdate
                    ? "bg-black text-white"
                    : "bg-transparent text-black hover:bg-black hover:text-white hover:transition-none"
              }`}
            >
              {updateBusy
                ? availableUpdate
                  ? "updating…"
                  : "checking…"
                : availableUpdate
                  ? `update to ${availableUpdate.version.startsWith("v") ? "" : "v"}${availableUpdate.version}`
                  : "check"}
            </button>
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
