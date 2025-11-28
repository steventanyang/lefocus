import { usePermissions } from "@/hooks/usePermissions";

interface OnboardingViewProps {
  onReload: () => void;
  onComplete?: () => void;
}

export function OnboardingView({ onReload, onComplete }: OnboardingViewProps) {
  const {
    screenRecording,
    spotifyAutomation,
    loading,
    error,
    allPermissionsGranted,
    openScreenRecordingSettings,
    requestSpotifyAutomationPermission,
    requestingSpotify,
    restartApp,
  } = usePermissions();

  const mediaPermission = {
    label: "Spotify",
    granted: spotifyAutomation,
    onAllow: requestSpotifyAutomationPermission,
    requesting: requestingSpotify,
    description: "Enable track detection and controls",
  };

  const handleScreenRecordingAllow = async () => {
    try {
      await openScreenRecordingSettings();
      // Polling will automatically start after opening settings
    } catch (err) {
      console.error("Failed to open screen recording settings:", err);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <div className="text-base font-light text-center">
          Checking permissions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          Error checking permissions: {error}
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => window.location.reload()}
            className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
          >
            Reload App
          </button>
          <button
            onClick={onReload}
            className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl flex flex-col items-center gap-12">
      {/* Privacy notice */}
      <p className="text-sm font-semibold text-center">
        LeFocus does not collect or transmit any data. All information is stored
        on your Mac.
      </p>

      {/* Permission section */}
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <div className="w-full flex flex-col md:flex-row gap-6">
          {/* Screen Recording Permission */}
          <div className="border border-black p-6 flex flex-col gap-4 w-full md:flex-1">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-base font-semibold">Screen Recording</h3>
              {screenRecording ? (
                <span className="text-xs px-2 py-1 border bg-green-100 text-green-800 border-green-500 font-normal whitespace-nowrap">
                  Granted
                </span>
              ) : (
                <span className="text-xs px-2 py-1 border bg-amber-100 text-amber-800 border-amber-300 font-normal whitespace-nowrap">
                  Required
                </span>
              )}
            </div>
            <p className="text-sm font-light text-gray-600">
              Let LeFocus capture application windows
            </p>
            {screenRecording ? (
              <div className="flex items-center justify-center mt-auto w-full">
                <div className="bg-green-100 border border-green-500 text-green-800 px-8 py-3.5 flex items-center justify-center w-full">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            ) : (
              <button
                onClick={handleScreenRecordingAllow}
                className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200 w-full mt-auto"
              >
                Allow
              </button>
            )}
          </div>

          {/* Media Automation Permissions */}
          <div className="border border-black p-6 flex flex-col gap-4 w-full md:flex-1">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-base font-semibold">Spotify Controls</h3>
              {spotifyAutomation ? (
                <span className="text-xs px-2 py-1 border bg-green-100 text-green-800 border-green-500 font-normal whitespace-nowrap">
                  Granted
                </span>
              ) : (
                <span className="text-xs px-2 py-1 border bg-amber-100 text-amber-800 border-amber-300 font-normal whitespace-nowrap">
                  Required
                </span>
              )}
            </div>
            <p className="text-sm font-light text-gray-600">
              Enable track detection and controls for the Dynamic Island
            </p>
            {spotifyAutomation ? (
              <div className="flex items-center justify-center mt-auto w-full">
                <div className="bg-green-100 border border-green-500 text-green-800 px-8 py-3.5 flex items-center justify-center w-full">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            ) : (
              <button
                onClick={mediaPermission.onAllow}
                disabled={mediaPermission.requesting}
                className={`bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200 w-full mt-auto ${
                  mediaPermission.requesting
                    ? "bg-gray-100 text-gray-400 cursor-wait"
                    : ""
                }`}
              >
                {mediaPermission.requesting ? "Waiting..." : "Allow"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status + restart */}
      <div className="w-full flex flex-col gap-2 items-center">
        <div className="min-h-[1.25rem] flex flex-col md:flex-row items-center justify-center gap-3 text-center">
          <p className="text-sm font-light text-gray-600">
            Updates might take a few seconds to update
          </p>
          <button
            onClick={restartApp}
            className="text-xs uppercase tracking-wide border border-black px-4 py-2 hover:bg-black hover:text-white transition"
          >
            Close & Reopen App
          </button>
        </div>
      </div>

      {/* Continue button */}
      <div className="w-full flex flex-col items-center gap-2">
        <button
          onClick={() => {
            if (allPermissionsGranted && onComplete) {
              onComplete();
            } else {
              onReload();
            }
          }}
          disabled={!allPermissionsGranted}
          className={`px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 ${
            allPermissionsGranted
              ? "bg-black border border-black text-white hover:bg-gray-800 hover:transition-none"
              : "bg-transparent border border-gray-300 text-gray-400 cursor-not-allowed"
          }`}
        >
          Start Using LeFocus
        </button>
      </div>
    </div>
  );
}
