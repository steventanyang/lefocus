import { usePermissions } from "@/hooks/usePermissions";

interface OnboardingViewProps {
  onReload: () => void;
}

export function OnboardingView({ onReload }: OnboardingViewProps) {
  const {
    screenRecording,
    accessibility,
    loading,
    error,
    allPermissionsGranted,
    openScreenRecordingSettings,
    openAccessibilitySettings,
  } = usePermissions();

  const handleScreenRecordingAllow = async () => {
    try {
      await openScreenRecordingSettings();
    } catch (err) {
      console.error("Failed to open screen recording settings:", err);
    }
  };

  const handleAccessibilityAllow = async () => {
    try {
      await openAccessibilitySettings();
    } catch (err) {
      console.error("Failed to open accessibility settings:", err);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-lg flex flex-col items-center gap-8">
        <div className="text-base font-light text-center">
          Checking permissions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-lg flex flex-col items-center gap-8">
        <div className="text-base font-light text-center text-red-600">
          Error checking permissions: {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
        >
          Reload App
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg flex flex-col items-center gap-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-4">Welcome to LeFocus</h1>
        <p className="text-base font-light text-gray-600 max-w-md">
          LeFocus needs access to certain macOS features to track your work sessions. Please grant the permissions below to get started.
        </p>
      </div>

      {/* Permission sections */}
      <div className="w-full space-y-6">
        {/* Screen Recording Permission */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                screenRecording ? "bg-green-500" : "bg-red-500"
              }`}>
                {screenRecording ? (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-base font-semibold">Screen Recording</h3>
                <p className="text-sm text-gray-600">Let LeFocus capture application windows</p>
              </div>
            </div>
          </div>
          {!screenRecording && (
            <button
              onClick={handleScreenRecordingAllow}
              className="w-full bg-transparent border border-black text-black px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
            >
              Allow
            </button>
          )}
          {screenRecording && (
            <div className="text-sm text-green-600 font-medium">✓ Permission granted</div>
          )}
        </div>

        {/* Accessibility Permission */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                accessibility ? "bg-green-500" : "bg-red-500"
              }`}>
                {accessibility ? (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-base font-semibold">Accessibility</h3>
                <p className="text-sm text-gray-600">Allow LeFocus to manage app focus and window tracking</p>
              </div>
            </div>
          </div>
          {!accessibility && (
            <button
              onClick={handleAccessibilityAllow}
              className="w-full bg-transparent border border-black text-black px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
            >
              Allow
            </button>
          )}
          {accessibility && (
            <div className="text-sm text-green-600 font-medium">✓ Permission granted</div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center space-y-4">
        <div className="text-sm text-gray-600 max-w-md">
          <p className="mb-2">
            <strong>How to grant permissions:</strong>
          </p>
          <ol className="text-left space-y-1 list-decimal list-inside">
            <li>Click "Allow" on each permission above</li>
            <li>System Settings will open to the correct page</li>
            <li>Toggle the permission switch on for LeFocus</li>
            <li>Return to this app (the status will update automatically)</li>
          </ol>
        </div>
      </div>

      {/* Reload button */}
      <div className="w-full flex justify-center">
        <button
          onClick={onReload}
          disabled={!allPermissionsGranted}
          className={`px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 ${
            allPermissionsGranted
              ? "bg-transparent border border-black text-black hover:bg-black hover:text-white hover:transition-none"
              : "bg-gray-200 border border-gray-300 text-gray-400 cursor-not-allowed"
          }`}
        >
          Start Using LeFocus
        </button>
        {!allPermissionsGranted && (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Please grant all permissions before continuing
          </p>
        )}
      </div>
    </div>
  );
}
