import { Segment } from "../types/segment";
import { useInterruptions } from "../hooks/useSegments";

interface SegmentDetailsModalProps {
  segment: Segment;
  onClose: () => void;
  onRegenerate?: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString();
}

function formatConfidence(value: number | null): string {
  if (value === null) return "N/A";
  return `${(value * 100).toFixed(0)}%`;
}

function getSegmentTypeLabel(type: string): string {
  switch (type) {
    case "stable":
      return "Stable";
    case "transitioning":
      return "Transitioning";
    case "distracted":
      return "Distracted";
    default:
      return type;
  }
}

export function SegmentDetailsModal({
  segment,
  onClose,
  onRegenerate,
}: SegmentDetailsModalProps) {
  const { interruptions, loading: interruptionsLoading } = useInterruptions(
    segment.id
  );

  const buttonPrimaryClass = "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white";
  const buttonSecondaryClass = "bg-transparent border border-black text-black px-8 py-3.5 text-base font-normal cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-8" onClick={onClose}>
      <div className="bg-white border-2 border-black max-w-[600px] w-full max-h-[90vh] overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-black">
          <h2 className="text-xl font-normal m-0">Segment Details</h2>
          <button
            className="bg-transparent border-none text-[2rem] leading-none cursor-pointer p-0 w-8 h-8 flex items-center justify-center transition-opacity duration-200 hover:opacity-70"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="p-6 flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-baseline py-2 border-b border-gray-200">
              <span className="text-sm font-light">Application</span>
              <span className="text-sm font-normal text-right max-w-[60%] break-words">
                {segment.appName || segment.bundleId}
              </span>
            </div>

            {segment.windowTitle && (
              <div className="flex justify-between items-baseline py-2 border-b border-gray-200">
                <span className="text-sm font-light">Window Title</span>
                <span className="text-sm font-normal text-right max-w-[60%] break-words">
                  {segment.windowTitle}
                </span>
              </div>
            )}

            <div className="flex justify-between items-baseline py-2 border-b border-gray-200">
              <span className="text-sm font-light">Type</span>
              <span className="text-sm font-normal text-right max-w-[60%] break-words">
                {getSegmentTypeLabel(segment.segmentType)}
              </span>
            </div>

            <div className="flex justify-between items-baseline py-2 border-b border-gray-200">
              <span className="text-sm font-light">Duration</span>
              <span className="text-sm font-normal text-right max-w-[60%] break-words">
                {formatDuration(segment.durationSecs)}
              </span>
            </div>

            <div className="flex justify-between items-baseline py-2 border-b border-gray-200">
              <span className="text-sm font-light">Time Range</span>
              <span className="text-sm font-normal text-right max-w-[60%] break-words">
                {formatTime(segment.startTime)} – {formatTime(segment.endTime)}
              </span>
            </div>

            <div className="flex justify-between items-baseline py-2 border-b border-gray-200">
              <span className="text-sm font-light">Readings</span>
              <span className="text-sm font-normal text-right max-w-[60%] break-words">
                {segment.readingCount}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-normal uppercase tracking-wide mb-2">
              Confidence Breakdown
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-light uppercase tracking-wide">Overall</span>
                <span className="text-xl font-semibold tabular-nums">
                  {formatConfidence(segment.confidence)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-light uppercase tracking-wide">Duration</span>
                <span className="text-xl font-semibold tabular-nums">
                  {formatConfidence(segment.durationScore)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-light uppercase tracking-wide">Stability</span>
                <span className="text-xl font-semibold tabular-nums">
                  {formatConfidence(segment.stabilityScore)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-light uppercase tracking-wide">Visual Clarity</span>
                <span className="text-xl font-semibold tabular-nums">
                  {formatConfidence(segment.visualClarityScore)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-light uppercase tracking-wide">OCR Quality</span>
                <span className="text-xl font-semibold tabular-nums">
                  {formatConfidence(segment.ocrQualityScore)}
                </span>
              </div>
            </div>
          </div>

          {segment.segmentType === "stable" && interruptions.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-normal uppercase tracking-wide mb-2">
                Interruptions ({interruptions.length})
              </h3>
              {interruptionsLoading ? (
                <div className="text-base font-light text-center p-8">
                  Loading interruptions...
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {interruptions.map((interruption) => (
                    <div
                      key={interruption.id}
                      className="flex justify-between items-center p-3 border border-gray-200 bg-transparent"
                    >
                      <span className="text-sm font-normal flex-1">
                        {interruption.appName || interruption.bundleId}
                      </span>
                      <span className="text-sm font-semibold tabular-nums mx-4">
                        {formatDuration(interruption.durationSecs)}
                      </span>
                      <span className="text-xs font-light text-gray-600">
                        at {formatTime(interruption.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {segment.segmentSummary && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-normal uppercase tracking-wide mb-2">Summary</h3>
              <p className="text-sm font-light leading-relaxed">
                {segment.segmentSummary}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-4 justify-end p-6 border-t border-black">
          {onRegenerate && (
            <button className={buttonSecondaryClass} onClick={onRegenerate}>
              Regenerate Segments
            </button>
          )}
          <button className={buttonPrimaryClass} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
