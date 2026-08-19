import { Segment } from "@/types/segment";
import { useInterruptions, useWindowTitles } from "@/hooks/queries";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";
import { KeyBox } from "@/components/ui/KeyBox";
import { useEffect } from "react";

interface SegmentDetailsModalProps {
  segment: Segment;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function formatClockTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function SegmentDetailsModal({
  segment,
  onClose,
}: SegmentDetailsModalProps) {
  const { data: interruptions = [], isLoading: interruptionsLoading } = useInterruptions(
    segment.id
  );
  const { data: windowTitles = [], isLoading: windowTitlesLoading } = useWindowTitles(
    segment.id
  );

  const sortedInterruptions = [...interruptions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    // Use capture phase to catch the event before other handlers (like fullscreen)
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [onClose]);

  const totalWindowTitleDuration = windowTitles.reduce((sum, wt) => sum + wt.durationSecs, 0);
  const totalInterruptionDuration = interruptions.reduce((sum, i) => sum + i.durationSecs, 0);
  const totalDuration = totalWindowTitleDuration + totalInterruptionDuration;
  const windowTitlesWithPercentages = windowTitles.map((wt) => ({
    ...wt,
    percentage: totalDuration > 0 ? (wt.durationSecs / totalDuration) * 100 : 0,
  }));
  const timeAwaySecs = Math.min(segment.durationSecs, totalInterruptionDuration);
  const focusedSecs = Math.max(0, segment.durationSecs - timeAwaySecs);
  const blockStart = new Date(segment.startTime);
  // Segment endTime is the final sample timestamp; duration includes the final
  // five-second sample, so derive the displayed end from the full duration.
  const blockEnd = new Date(blockStart.getTime() + segment.durationSecs * 1000);

  // Get app color for bars
  const appColor = getAppColor(segment.bundleId, {
    iconColor: segment.iconColor,
    confidence: segment.confidence,
  });

  return (
    <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-[1000] p-8" onClick={onClose}>
      <div className="bg-white max-w-[600px] w-full max-h-[90vh] overflow-y-auto flex flex-col shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start p-6">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            {/* App Icon - bigger to match app name + time height */}
            {shouldShowAppleLogo(segment.bundleId, segment.appName) ? (
              <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center text-gray-800">
                <AppleLogo className="w-12 h-12" />
              </div>
            ) : segment.iconDataUrl ? (
              <img
                src={segment.iconDataUrl}
                alt={segment.appName || segment.bundleId}
                className="w-14 h-14 flex-shrink-0"
              />
            ) : (
              <div
                className="w-14 h-14 border border-black flex-shrink-0"
                style={{ backgroundColor: appColor }}
              />
            )}

            {/* Total mins / App Name */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-xl font-semibold break-words">
                {formatDuration(segment.durationSecs)}
              </span>
              <span className="text-sm font-light text-gray-600 break-words">
                {segment.appName || segment.bundleId}
              </span>
            </div>
          </div>

          {/* Close Button with ESC key box */}
          <div className="flex items-center gap-2 ml-4">
            <KeyBox className="w-12 h-6 py-1">esc</KeyBox>
            <button
              className="bg-transparent border-none text-base font-normal cursor-pointer p-0 transition-opacity duration-200 hover:opacity-70"
              onClick={onClose}
              aria-label="close"
            >
              close
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-6 pb-6 flex flex-col gap-6 overflow-y-auto">
          {/* Compact block summary */}
          <section aria-labelledby="block-summary-heading" className="flex flex-col gap-3">
            <h3
              id="block-summary-heading"
              className="w-full text-right text-base font-normal text-gray-700 tabular-nums"
            >
                {formatClockTime(blockStart)}–{formatClockTime(blockEnd)}
            </h3>

            <dl className="grid grid-cols-3 gap-8 py-2">
              <div className="min-w-0">
                <dt className="text-sm font-light text-gray-500">focused</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {interruptionsLoading ? "—" : formatDuration(focusedSecs)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm font-light text-gray-500">time away</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {interruptionsLoading ? "—" : formatDuration(timeAwaySecs)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm font-light text-gray-500">interruptions</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {interruptionsLoading ? "—" : interruptions.length}
                </dd>
              </div>
            </dl>
          </section>

          {/* Historical window titles remain available when captured. */}
          {!windowTitlesLoading && windowTitlesWithPercentages.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-normal tracking-wide text-gray-800">
                window titles
              </h3>
              <div className="flex flex-col gap-3">
                {windowTitlesWithPercentages.map((wt, index) => (
                <div key={index} className="flex items-end gap-3">
                  {/* App Icon - height matches name + bar */}
                  {shouldShowAppleLogo(segment.bundleId, segment.appName) ? (
                    <div className="flex-shrink-0 flex items-center justify-center text-gray-800" style={{ height: 'calc(1.25rem + 0.5rem + 0.25rem)' }}>
                      <AppleLogo className="w-5 h-5" />
                    </div>
                  ) : segment.iconDataUrl ? (
                    <img
                      src={segment.iconDataUrl}
                      alt={segment.appName || segment.bundleId}
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
                          width: `${wt.percentage}%`,
                          backgroundColor: appColor,
                        }}
                      />
                    </div>
                  </div>

                  {/* Percentage spans full height (name + bar) */}
                  <span className="text-2xl font-semibold tabular-nums w-16 text-right leading-none">
                    {wt.percentage.toFixed(0)}%
                  </span>
                </div>
                ))}
              </div>
            </div>
          )}

          {/* Interruptions List */}
          {(interruptionsLoading || sortedInterruptions.length > 0) && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-normal tracking-wide text-gray-800">
                interruptions
              </h3>
              {interruptionsLoading ? (
                <div className="text-base font-light text-center p-4">
                  loading interruptions...
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedInterruptions.map((interruption) => {
                    const interruptionColor = getAppColor(interruption.bundleId, {
                      iconColor: interruption.iconColor,
                    });
                    const offsetSecs = Math.max(
                      0,
                      Math.round(
                        (new Date(interruption.timestamp).getTime() - blockStart.getTime()) /
                          1000
                      )
                    );
                    return (
                      <div
                        key={interruption.id}
                        className="flex items-center justify-between gap-4 py-1"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {shouldShowAppleLogo(interruption.bundleId, interruption.appName) ? (
                            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-gray-800">
                              <AppleLogo className="w-4 h-4" />
                            </div>
                          ) : interruption.iconDataUrl ? (
                            <img
                              src={interruption.iconDataUrl}
                              alt={interruption.appName || interruption.bundleId}
                              className="w-5 h-5 flex-shrink-0"
                            />
                          ) : (
                            <div
                              className="w-5 h-5 flex-shrink-0 border border-black"
                              style={{ backgroundColor: interruptionColor }}
                            />
                          )}
                          <span className="text-sm font-normal truncate">
                            {interruption.appName || interruption.bundleId}
                          </span>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="text-sm font-medium tabular-nums">
                            {formatDuration(interruption.durationSecs)}
                          </span>
                          <span className="text-xs font-light text-gray-500 tabular-nums">
                            {offsetSecs === 0
                              ? "at block start"
                              : `${formatDuration(offsetSecs)} into block`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
