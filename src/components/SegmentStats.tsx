import { SegmentStats as Stats } from "../types/segment";

interface SegmentStatsProps {
  stats: Stats;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function SegmentStats({ stats }: SegmentStatsProps) {
  return (
    <div className="border border-black p-6 flex flex-col gap-6">
      <div className="text-base font-light tracking-wide uppercase pb-2 border-b border-black">
        Session Summary
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-light uppercase tracking-wide">Total Duration</div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatDuration(stats.totalDurationSecs)}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-light uppercase tracking-wide">Segments</div>
          <div className="text-2xl font-semibold tabular-nums">{stats.segmentCount}</div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="w-full h-2 bg-gray-200 border border-black">
            <div
              className="h-full bg-segment-stable transition-all duration-300"
              style={{ width: `${stats.stablePercentage}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-normal">Stable</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatDuration(stats.stableDurationSecs)} (
              {stats.stablePercentage.toFixed(0)}%)
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="w-full h-2 bg-gray-200 border border-black">
            <div
              className="h-full bg-segment-transitioning transition-all duration-300"
              style={{ width: `${stats.transitioningPercentage}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-normal">Transitioning</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatDuration(stats.transitioningDurationSecs)} (
              {stats.transitioningPercentage.toFixed(0)}%)
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="w-full h-2 bg-gray-200 border border-black">
            <div
              className="h-full bg-segment-distracted transition-all duration-300"
              style={{ width: `${stats.distractedPercentage}%` }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-normal">Distracted</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatDuration(stats.distractedDurationSecs)} (
              {stats.distractedPercentage.toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
