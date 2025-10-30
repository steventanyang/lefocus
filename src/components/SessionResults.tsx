import { useState } from "react";
import { Segment } from "../types/segment";
import { useSegments, calculateSegmentStats } from "../hooks/useSegments";
import { SegmentStats } from "./SegmentStats";
import { SegmentTimeline } from "./SegmentTimeline";
import { SegmentDetailsModal } from "./SegmentDetailsModal";

interface SessionResultsProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionResults({ sessionId, onBack }: SessionResultsProps) {
  const { segments, loading, error, regenerateSegments } =
    useSegments(sessionId);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const stats = calculateSegmentStats(segments);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setSelectedSegment(null);
    await regenerateSegments();
    setIsRegenerating(false);
  };

  if (loading && segments.length === 0) {
    return (
      <div className="session-results">
        <div className="loading">Loading session results...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-results">
        <div className="error">{error}</div>
        <button className="button-primary" onClick={onBack}>
          Back to Timer
        </button>
      </div>
    );
  }

  return (
    <div className="session-results">
      <div className="results-header">
        <h1>Session Complete</h1>
        <button className="back-button" onClick={onBack}>
          ← Back to Timer
        </button>
      </div>

      {isRegenerating && (
        <div className="regenerating-banner">
          Regenerating segments...
        </div>
      )}

      {segments.length === 0 ? (
        <div className="no-segments">
          <p>No segments were generated for this session.</p>
          <p className="hint">
            This may happen if the session was too short or no context readings
            were captured.
          </p>
          <button className="button-primary" onClick={onBack}>
            Start New Session
          </button>
        </div>
      ) : (
        <div className="results-content">
          <SegmentStats stats={stats} />
          <SegmentTimeline
            segments={segments}
            onSegmentClick={setSelectedSegment}
          />

          <div className="results-actions">
            <button className="button-secondary" onClick={handleRegenerate}>
              Regenerate Segments
            </button>
            <button className="button-primary" onClick={onBack}>
              Start New Session
            </button>
          </div>
        </div>
      )}

      {selectedSegment && (
        <SegmentDetailsModal
          segment={selectedSegment}
          onClose={() => setSelectedSegment(null)}
          onRegenerate={handleRegenerate}
        />
      )}
    </div>
  );
}
