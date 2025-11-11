import { SegmentStats as Stats, Segment } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";

interface SegmentStatsProps {
  stats: Stats;
  segments: Segment[];
  onSegmentClick: (segment: Segment) => void;
  backButton?: React.ReactNode;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function SegmentStats({
  stats,
  segments,
  onSegmentClick,
  backButton,
}: SegmentStatsProps) {
  const totalDuration = segments.reduce(
    (sum, seg) => sum + seg.durationSecs,
    0
  );

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between pb-2">
        <div className="text-base font-light tracking-wide uppercase">
          Session Summary
        </div>
        {backButton && <div>{backButton}</div>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-light uppercase tracking-wide">
          Total Duration
        </div>
        <div className="text-2xl font-semibold tabular-nums">
          {formatDuration(stats.totalDurationSecs)}
        </div>
      </div>

      {/* Timeline embedded here */}
      {segments.length > 0 && (
        <div className="flex h-[60px] border border-black overflow-hidden bg-white">
          {segments.map((segment) => {
            const widthPercent = (segment.durationSecs / totalDuration) * 100;
            const backgroundColor = getAppColor(segment.bundleId, {
              iconColor: segment.iconColor,
              confidence: segment.confidence,
            });
            return (
              <button
                key={segment.id}
                className="border-none border-r border-black p-0 cursor-pointer transition-opacity duration-200 hover:opacity-70 last:border-r-0"
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
      )}

      {stats.topApps.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-light uppercase tracking-wide">
            Top Applications
          </h3>
          {stats.topApps.map((app) => (
            <div key={app.bundleId} className="flex items-end gap-3">
              {/* Icon on left */}
              {app.iconDataUrl ? (
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
                  <div className="flex-1 h-2 bg-gray-200">
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
              <span className="text-2xl font-semibold tabular-nums w-16 text-right self-center leading-none -mb-1">
                {app.percentage.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
