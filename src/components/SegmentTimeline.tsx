import { Segment } from "../types/segment";

interface SegmentTimelineProps {
  segments: Segment[];
  onSegmentClick: (segment: Segment) => void;
}

function getSegmentTypeClass(type: string): string {
  switch (type) {
    case "stable":
      return "segment-stable";
    case "transitioning":
      return "segment-transitioning";
    case "distracted":
      return "segment-distracted";
    default:
      return "";
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function SegmentTimeline({
  segments,
  onSegmentClick,
}: SegmentTimelineProps) {
  if (segments.length === 0) {
    return (
      <div className="segment-timeline">
        <div className="timeline-header">Timeline</div>
        <div className="timeline-empty">No segments found</div>
      </div>
    );
  }

  // Calculate total duration for proportional sizing
  const totalDuration = segments.reduce(
    (sum, seg) => sum + seg.durationSecs,
    0
  );

  return (
    <div className="segment-timeline">
      <div className="timeline-header">Timeline</div>

      <div className="timeline-bars">
        {segments.map((segment) => {
          const widthPercent = (segment.durationSecs / totalDuration) * 100;
          return (
            <button
              key={segment.id}
              className={`timeline-segment ${getSegmentTypeClass(
                segment.segmentType
              )}`}
              style={{ width: `${widthPercent}%` }}
              onClick={() => onSegmentClick(segment)}
              title={`${segment.appName || segment.bundleId} - ${formatDuration(
                segment.durationSecs
              )}`}
            />
          );
        })}
      </div>

      <div className="timeline-legend">
        <div className="legend-item">
          <span className="legend-color segment-stable" />
          <span className="legend-label">Stable</span>
        </div>
        <div className="legend-item">
          <span className="legend-color segment-transitioning" />
          <span className="legend-label">Transitioning</span>
        </div>
        <div className="legend-item">
          <span className="legend-color segment-distracted" />
          <span className="legend-label">Distracted</span>
        </div>
      </div>
    </div>
  );
}
