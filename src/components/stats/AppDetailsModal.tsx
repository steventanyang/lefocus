import { useEffect } from "react";
import { AppDuration } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";
import { KeyBox } from "@/components/ui/KeyBox";
import { useAppDetails } from "@/hooks/queries";

interface AppDetailsModalProps {
  app: AppDuration;
  startTime: string;
  endTime: string;
  onClose: () => void;
}

export function AppDetailsModal({ app, startTime, endTime, onClose }: AppDetailsModalProps) {
  const { data: details, isLoading } = useAppDetails(app.bundleId, startTime, endTime);

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
        className="bg-white max-w-[600px] w-full max-h-[90vh] overflow-y-auto flex flex-col shadow-lg" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-6">
          <div className="flex items-start gap-4 flex-1 min-w-0">
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

            {/* App Name & Stats */}
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

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto">
          {isLoading ? (
             <div className="text-base font-light text-center p-8">
               Loading details...
             </div>
          ) : !details ? (
             <div className="text-base font-light text-center p-8">
               Failed to load details
             </div>
          ) : (
            <>
              {/* Window List with Bar Charts */}
              {details.windowTitles.length > 0 ? (
                <div className="flex flex-col gap-4">
                  <h3 className="text-sm font-normal tracking-wide text-gray-800">
                    Windows
                  </h3>
                  <div className="flex flex-col gap-3">
                    {details.windowTitles.map((wt, index) => {
                      // Use app total duration for percentage calculation to show contribution
                      const percentage = app.durationSecs > 0 
                        ? (wt.durationSecs / app.durationSecs) * 100 
                        : 0;
                      
                      return (
                        <div key={index} className="flex items-end gap-3">
                          {/* App Icon - small repeated icon for visual consistency */}
                          {shouldShowAppleLogo(app.bundleId, app.appName) ? (
                            <div className="flex-shrink-0 flex items-center justify-center text-gray-800" style={{ height: 'calc(1.25rem + 0.5rem + 0.25rem)' }}>
                              <AppleLogo className="w-5 h-5" />
                            </div>
                          ) : app.iconDataUrl ? (
                            <img
                              src={app.iconDataUrl}
                              alt={app.appName || app.bundleId}
                              className="flex-shrink-0"
                              style={{ height: 'calc(1.25rem + 0.5rem + 0.25rem)' }}
                            />
                          ) : (
                            <div
                              className="flex-shrink-0 border border-black"
                              style={{ 
                                height: 'calc(1.25rem + 0.5rem + 0.25rem)',
                                width: 'calc(1.25rem + 0.5rem + 0.25rem)',
                                backgroundColor: appColor 
                              }}
                            />
                          )}

                          {/* Name and bar stacked vertically */}
                          <div className="flex-1 flex flex-col gap-1 min-w-0">
                            {/* Window Title Name */}
                            <span className="text-sm font-normal truncate max-w-[90%]">
                              {wt.title}
                            </span>

                            {/* Horizontal Bar */}
                            <div className="h-2 bg-gray-200 relative overflow-hidden">
                              <div
                                className="h-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(percentage, 100)}%`,
                                  backgroundColor: appColor,
                                }}
                              />
                            </div>
                          </div>

                          {/* Percentage spans full height (name + bar) */}
                          <span className="text-2xl font-semibold tabular-nums w-16 text-right leading-none">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-base font-light text-center p-8 text-gray-500">
                  No window titles found
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
