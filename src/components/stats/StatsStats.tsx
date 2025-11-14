import { useState } from "react";
import { SegmentStats as Stats, Segment } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";

interface StatsStatsProps {
  stats: Stats;
  segments: Segment[];
  onSegmentClick: (segment: Segment) => void;
  showAllApps: boolean;
  onToggleShowAll: () => void;
  timeWindowSelector?: React.ReactNode;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

// Convert hex color to rgba with opacity for light background
function hexToRgba(hex: string, opacity: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  // Handle both 3-digit and 6-digit hex
  const r = parseInt(cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function StatsStats({
  stats,
  segments,
  onSegmentClick,
  showAllApps,
  onToggleShowAll,
  timeWindowSelector,
}: StatsStatsProps) {
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);

  // Filter segments based on selected app
  const filteredSegments = selectedBundleId
    ? segments.filter((seg) => seg.bundleId === selectedBundleId)
    : segments;

  // Toggle selection handler
  const handleAppClick = (bundleId: string) => {
    setSelectedBundleId((prev) => (prev === bundleId ? null : bundleId));
  };

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-normal tracking-wide text-gray-800">
            Total Duration
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatDuration(stats.totalDurationSecs)}
          </div>
        </div>
        {timeWindowSelector && (
          <div className="flex gap-2 pt-0.5">
            {timeWindowSelector}
          </div>
        )}
      </div>

      {stats.topApps.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-normal tracking-wide text-gray-800">
              Top Applications
            </h3>
            <button
              onClick={onToggleShowAll}
              className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors"
            >
              {showAllApps ? "Hide" : "Show All"}
            </button>
          </div>
          {stats.topApps.map((app) => {
            const isSelected = selectedBundleId === app.bundleId;
            const appColor = getAppColor(app.bundleId, { iconColor: app.iconColor });
            const lightBgColor = isSelected ? hexToRgba(appColor, 0.15) : undefined;
            return (
              <button
                key={app.bundleId}
                onClick={() => handleAppClick(app.bundleId)}
                className={`flex items-center gap-3 w-full text-left transition-all duration-200 rounded p-2 -m-2 ${
                  !isSelected ? "hover:bg-gray-50" : ""
                }`}
                style={isSelected ? { backgroundColor: lightBgColor } : undefined}
              >
                {/* Icon on left */}
                {shouldShowAppleLogo(app.bundleId, app.appName) ? (
                  <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-gray-800">
                    <AppleLogo className="w-6 h-6" />
                  </div>
                ) : app.iconDataUrl ? (
                  <img
                    src={app.iconDataUrl}
                    alt={app.appName || app.bundleId}
                    className="w-8 h-8 flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-8 h-8 border border-black flex-shrink-0"
                    style={{ backgroundColor: getAppColor(app.bundleId, { iconColor: app.iconColor }) }}
                  />
                )}

                {/* Name and bar stacked vertically on right - aligned top to bottom with icon */}
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  {/* Top row: Name on left, duration above end of bar */}
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-normal flex-1">
                      {app.appName || app.bundleId}
                    </span>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-gray-600">
                      {formatDuration(app.durationSecs)}
                    </span>
                  </div>
                  {/* Bottom row: Progress bar taking full width, percentage overlaid on right */}
                  <div className="flex items-end gap-2">
                    <div className={`flex-1 h-2 transition-all duration-300 ${isSelected ? 'bg-white' : 'bg-gray-200'}`}>
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${app.percentage}%`,
                          backgroundColor: getAppColor(app.bundleId, { iconColor: app.iconColor }),
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* Percentage spans full height on the right */}
                <span className="text-2xl font-semibold tabular-nums w-16 text-right leading-none">
                  {app.percentage.toFixed(0)}%
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

