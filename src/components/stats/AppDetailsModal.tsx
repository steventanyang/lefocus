import { useEffect } from "react";
import { AppDuration } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";
import { KeyBox } from "@/components/ui/KeyBox";

interface AppDetailsModalProps {
  app: AppDuration;
  onClose: () => void;
}

export function AppDetailsModal({ app, onClose }: AppDetailsModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [onClose]);

  const appColor = getAppColor(app.bundleId, { iconColor: app.iconColor });

  return (
    <div 
      className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-[1000] p-8" 
      onClick={onClose}
    >
      <div 
        className="bg-white max-w-[600px] w-full max-h-[90vh] overflow-y-auto flex flex-col shadow-lg rounded-lg" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-gray-100">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* App Icon */}
            {shouldShowAppleLogo(app.bundleId, app.appName) ? (
              <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center text-gray-800">
                <AppleLogo className="w-12 h-12" />
              </div>
            ) : app.iconDataUrl ? (
              <img
                src={app.iconDataUrl}
                alt={app.appName || app.bundleId}
                className="w-14 h-14 flex-shrink-0"
              />
            ) : (
              <div
                className="w-14 h-14 border border-black flex-shrink-0"
                style={{ backgroundColor: appColor }}
              />
            )}

            {/* App Name */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-xl font-semibold break-words">
                {app.appName || app.bundleId}
              </span>
              <span className="text-sm font-light text-gray-600">
                {app.percentage.toFixed(0)}% of time
              </span>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex items-center gap-2 ml-4">
            <KeyBox className="w-12 h-6 py-1">esc</KeyBox>
            <button
              className="bg-transparent border-none text-base font-normal cursor-pointer p-0 transition-opacity duration-200 hover:opacity-70"
              onClick={onClose}
              aria-label="Close"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content - Empty for now as requested */}
        <div className="p-6 min-h-[200px] flex items-center justify-center text-gray-400 font-light">
          Details coming soon...
        </div>
      </div>
    </div>
  );
}
