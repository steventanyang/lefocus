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
    <div className="segment-stats">
      <div className="stat-header">Session Summary</div>

      <div className="stat-grid">
        <div className="stat-item">
          <div className="stat-label">Total Duration</div>
          <div className="stat-value">
            {formatDuration(stats.totalDurationSecs)}
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-label">Segments</div>
          <div className="stat-value">{stats.segmentCount}</div>
        </div>
      </div>

      <div className="stat-breakdown">
        <div className="breakdown-item stable">
          <div className="breakdown-bar-container">
            <div
              className="breakdown-bar"
              style={{ width: `${stats.stablePercentage}%` }}
            />
          </div>
          <div className="breakdown-details">
            <span className="breakdown-label">Stable</span>
            <span className="breakdown-value">
              {formatDuration(stats.stableDurationSecs)} (
              {stats.stablePercentage.toFixed(0)}%)
            </span>
          </div>
        </div>

        <div className="breakdown-item transitioning">
          <div className="breakdown-bar-container">
            <div
              className="breakdown-bar"
              style={{ width: `${stats.transitioningPercentage}%` }}
            />
          </div>
          <div className="breakdown-details">
            <span className="breakdown-label">Transitioning</span>
            <span className="breakdown-value">
              {formatDuration(stats.transitioningDurationSecs)} (
              {stats.transitioningPercentage.toFixed(0)}%)
            </span>
          </div>
        </div>

        <div className="breakdown-item distracted">
          <div className="breakdown-bar-container">
            <div
              className="breakdown-bar"
              style={{ width: `${stats.distractedPercentage}%` }}
            />
          </div>
          <div className="breakdown-details">
            <span className="breakdown-label">Distracted</span>
            <span className="breakdown-value">
              {formatDuration(stats.distractedDurationSecs)} (
              {stats.distractedPercentage.toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
