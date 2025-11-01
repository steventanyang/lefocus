import { Segment } from "../types/segment";

interface SegmentTimelineProps {
  segments: Segment[];
  onSegmentClick: (segment: Segment) => void;
}

function getConfidenceColorClass(confidence: number): string {
  if (confidence >= 0.7) return "bg-green-500"; // High confidence - focused work
  if (confidence >= 0.4) return "bg-yellow-400"; // Medium confidence - mixed
  return "bg-red-400"; // Low confidence - unclear
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "Focused";
  if (confidence >= 0.4) return "Mixed";
  return "Unclear";
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
      <div className="bg-white border border-black p-6 flex flex-col gap-6">
        <div className="text-base font-light tracking-wide uppercase pb-2 border-b border-black">
          Timeline
        </div>
        <div className="text-center p-8 font-light">No segments found</div>
      </div>
    );
  }

  // Calculate total duration for proportional sizing
  const totalDuration = segments.reduce(
    (sum, seg) => sum + seg.durationSecs,
    0
  );

  return (
    <div className="bg-white border border-black p-6 flex flex-col gap-6">
      <div className="text-base font-light tracking-wide uppercase pb-2 border-b border-black">
        Timeline
      </div>

      <div className="flex h-[60px] border border-black overflow-hidden bg-white">
        {segments.map((segment) => {
          const widthPercent = (segment.durationSecs / totalDuration) * 100;
          return (
            <button
              key={segment.id}
              className={`border-none border-r border-black p-0 cursor-pointer transition-opacity duration-200 hover:opacity-70 last:border-r-0 ${getConfidenceColorClass(
                segment.confidence
              )}`}
              style={{ width: `${widthPercent}%` }}
              onClick={() => onSegmentClick(segment)}
              title={`${segment.appName || segment.bundleId} - ${formatDuration(
                segment.durationSecs
              )} (${getConfidenceLabel(segment.confidence)})`}
            />
          );
        })}
      </div>

      <div className="flex gap-8 justify-center pt-2">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 border border-black bg-green-500" />
          <span className="text-sm font-light">Focused (≥70%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 border border-black bg-yellow-400" />
          <span className="text-sm font-light">Mixed (40-70%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 border border-black bg-red-400" />
          <span className="text-sm font-light">Unclear (&lt;40%)</span>
        </div>
      </div>
    </div>
  );
}
