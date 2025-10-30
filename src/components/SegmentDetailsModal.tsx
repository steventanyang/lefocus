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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Segment Details</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="detail-section">
            <div className="detail-row">
              <span className="detail-label">Application</span>
              <span className="detail-value">
                {segment.appName || segment.bundleId}
              </span>
            </div>

            {segment.windowTitle && (
              <div className="detail-row">
                <span className="detail-label">Window Title</span>
                <span className="detail-value">{segment.windowTitle}</span>
              </div>
            )}

            <div className="detail-row">
              <span className="detail-label">Type</span>
              <span className="detail-value">
                {getSegmentTypeLabel(segment.segmentType)}
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Duration</span>
              <span className="detail-value">
                {formatDuration(segment.durationSecs)}
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Time Range</span>
              <span className="detail-value">
                {formatTime(segment.startTime)} – {formatTime(segment.endTime)}
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Readings</span>
              <span className="detail-value">{segment.readingCount}</span>
            </div>
          </div>

          <div className="detail-section">
            <h3 className="section-title">Confidence Breakdown</h3>
            <div className="confidence-grid">
              <div className="confidence-item">
                <span className="confidence-label">Overall</span>
                <span className="confidence-value">
                  {formatConfidence(segment.confidence)}
                </span>
              </div>
              <div className="confidence-item">
                <span className="confidence-label">Duration</span>
                <span className="confidence-value">
                  {formatConfidence(segment.durationScore)}
                </span>
              </div>
              <div className="confidence-item">
                <span className="confidence-label">Stability</span>
                <span className="confidence-value">
                  {formatConfidence(segment.stabilityScore)}
                </span>
              </div>
              <div className="confidence-item">
                <span className="confidence-label">Visual Clarity</span>
                <span className="confidence-value">
                  {formatConfidence(segment.visualClarityScore)}
                </span>
              </div>
              <div className="confidence-item">
                <span className="confidence-label">OCR Quality</span>
                <span className="confidence-value">
                  {formatConfidence(segment.ocrQualityScore)}
                </span>
              </div>
            </div>
          </div>

          {segment.segmentType === "stable" && interruptions.length > 0 && (
            <div className="detail-section">
              <h3 className="section-title">
                Interruptions ({interruptions.length})
              </h3>
              {interruptionsLoading ? (
                <div className="loading">Loading interruptions...</div>
              ) : (
                <div className="interruptions-list">
                  {interruptions.map((interruption) => (
                    <div key={interruption.id} className="interruption-item">
                      <span className="interruption-app">
                        {interruption.appName || interruption.bundleId}
                      </span>
                      <span className="interruption-duration">
                        {formatDuration(interruption.durationSecs)}
                      </span>
                      <span className="interruption-time">
                        at {formatTime(interruption.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {segment.segmentSummary && (
            <div className="detail-section">
              <h3 className="section-title">Summary</h3>
              <p className="segment-summary">{segment.segmentSummary}</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {onRegenerate && (
            <button className="button-secondary" onClick={onRegenerate}>
              Regenerate Segments
            </button>
          )}
          <button className="button-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
