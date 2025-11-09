import { SegmentStats as Stats, Segment } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";

interface SegmentStatsProps {
  stats: Stats;
  segments: Segment[];
  onSegmentClick: (segment: Segment) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function SegmentStats({ stats, segments, onSegmentClick }: SegmentStatsProps) {
  const totalDuration = segments.reduce((sum, seg) => sum + seg.durationSecs, 0);

  return (
    <div className="border border-black p-6 flex flex-col gap-6">
      <div className="text-base font-light tracking-wide uppercase pb-2 border-b border-black">
        Session Summary
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-light uppercase tracking-wide">Total Duration</div>
        <div className="text-2xl font-semibold tabular-nums">
          {formatDuration(stats.totalDurationSecs)}
        </div>
      </div>

      {/* Timeline embedded here */}
      {segments.length > 0 && (
        <div className="flex h-[60px] border border-black overflow-hidden bg-white">
          {segments.map((segment) => {
            const widthPercent = (segment.durationSecs / totalDuration) * 100;
            const backgroundColor = getAppColor(segment.bundleId, segment.confidence);
            return (
              <button
                key={segment.id}
                className="border-none border-r border-black p-0 cursor-pointer transition-opacity duration-200 hover:opacity-70 last:border-r-0"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor
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
          <h3 className="text-xs font-light uppercase tracking-wide">Top Applications</h3>
          {stats.topApps.map((app) => (
            <div key={app.bundleId} className="flex flex-col gap-2">
              <div className="w-full h-2 bg-gray-200 border border-black">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${app.percentage}%`,
                    backgroundColor: getAppColor(app.bundleId)
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {app.iconDataUrl ? (
                    <img
                      src={app.iconDataUrl}
                      alt={app.appName || app.bundleId}
                      className="w-4 h-4 flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-4 h-4 border border-black flex-shrink-0"
                      style={{ backgroundColor: getAppColor(app.bundleId) }}
                    />
                  )}
                  <span className="text-sm font-normal">{app.appName || app.bundleId}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {formatDuration(app.durationSecs)} ({app.percentage.toFixed(0)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
