import { useSpotifyPermission } from "@/hooks/usePermissions";
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

  return (
    <div>
      {/* Permissions Section */}
      <div className="mb-8">
        <h2 className="text-base font-normal tracking-wide text-gray-800 mb-4">
          permissions
        </h2>
        <div className="flex flex-col gap-3 max-w-2xl">
          <div className="border border-black p-4 flex items-center justify-between gap-4">
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
                onClick={requestSpotifyAutomationPermission}
                disabled={requestingSpotify || loading}
                className={`bg-transparent border border-black text-black px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200 whitespace-nowrap ${
                  requestingSpotify || loading ? "bg-gray-100 text-gray-400 cursor-wait" : ""
                }`}
              >
                {requestingSpotify ? "waiting..." : "allow"}
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
        <div className="flex flex-col gap-3 max-w-2xl">
          <div className="border border-black p-4 flex items-center justify-between gap-4">
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
        </div>
      </div>
    </div>
  );
}
