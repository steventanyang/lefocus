import { useState } from "react";
import { SegmentStats as Stats, Segment } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";

interface SegmentStatsProps {
  stats: Stats;
  segments: Segment[];
  onSegmentClick: (segment: Segment) => void;
  backButton?: React.ReactNode;
  dateTime?: string; // ISO 8601 datetime string
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const timeString = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  
  if (isToday) {
    return `Today ${timeString}`;
  }
  
  const dateString = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  
  return `${dateString} ${timeString}`;
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

// Apple logo SVG component
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

// Check if app should show Apple logo
function shouldShowAppleLogo(bundleId: string, appName: string | null): boolean {
  return (
    bundleId === "com.apple.system" ||
    appName === "System UI" ||
    appName === "Login Window" ||
    bundleId.toLowerCase().includes("loginwindow")
  );
}

export function SegmentStats({
  stats,
  segments,
  onSegmentClick,
  backButton,
  dateTime,
}: SegmentStatsProps) {
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);

  // Filter segments based on selected app
  const filteredSegments = selectedBundleId
    ? segments.filter((seg) => seg.bundleId === selectedBundleId)
    : segments;

  // Recalculate total duration from filtered segments
  const totalDuration = filteredSegments.reduce(
    (sum, seg) => sum + seg.durationSecs,
    0
  );

  // Toggle selection handler
  const handleAppClick = (bundleId: string) => {
    setSelectedBundleId((prev) => (prev === bundleId ? null : bundleId));
  };

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between pb-2">
        <div className="text-base font-light tracking-wide">
          {dateTime ? formatDateTime(dateTime) : "Session Summary"}
        </div>
        {backButton && <div>{backButton}</div>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-normal tracking-wide text-gray-800">
          Total Duration
        </div>
        <div className="text-2xl font-semibold tabular-nums">
          {formatDuration(stats.totalDurationSecs)}
        </div>
      </div>

      {/* Timeline embedded here */}
      {filteredSegments.length > 0 ? (
        <div className="flex h-[60px] gap-[3px] overflow-hidden">
          {filteredSegments.map((segment) => {
            const widthPercent = totalDuration > 0 
              ? (segment.durationSecs / totalDuration) * 100 
              : 0;
            const backgroundColor = getAppColor(segment.bundleId, {
              iconColor: segment.iconColor,
              confidence: segment.confidence,
            });
            return (
              <button
                key={segment.id}
                className="rounded p-0 cursor-pointer transition-opacity duration-200 hover:opacity-70"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor,
                }}
                onClick={() => onSegmentClick(segment)}
                title={`${segment.appName || segment.bundleId} - ${formatDuration(
                  segment.durationSecs
                )}`}
              />
            );
          })}
        </div>
      ) : selectedBundleId ? (
        <div className="flex h-[60px] items-center justify-center text-sm text-gray-500">
          No segments found for selected app
        </div>
      ) : null}

      {stats.topApps.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-normal tracking-wide text-gray-800">
            Top Applications
          </h3>
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
