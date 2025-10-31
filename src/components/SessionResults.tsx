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

  const buttonPrimaryClass = "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white";
  const buttonSecondaryClass = "bg-transparent border border-black text-black px-8 py-3.5 text-base font-normal cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white";

  if (loading && segments.length === 0) {
    return (
      <div className="w-full max-w-3xl flex flex-col gap-8">
        <div className="text-base font-light text-center p-8">Loading session results...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-3xl flex flex-col gap-8">
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">{error}</div>
        <button className={buttonPrimaryClass} onClick={onBack}>
          Back to Timer
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      <div className="flex justify-between items-center pb-4 border-b border-black">
        <h1 className="text-2xl font-light tracking-wide">Session Complete</h1>
        <button
          className="bg-transparent border border-black text-black px-4 py-2 text-sm font-light cursor-pointer transition-all duration-200 hover:bg-black hover:text-white"
          onClick={onBack}
        >
          ← Back to Timer
        </button>
      </div>

      {isRegenerating && (
        <div className="text-center p-4 border border-black bg-transparent font-normal">
          Regenerating segments...
        </div>
      )}

      {segments.length === 0 ? (
        <div className="text-center p-12 px-8 flex flex-col gap-4">
          <p>No segments were generated for this session.</p>
          <p className="text-sm font-light text-gray-600">
            This may happen if the session was too short or no context readings
            were captured.
          </p>
          <button className={buttonPrimaryClass} onClick={onBack}>
            Start New Session
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <SegmentStats stats={stats} />
          <SegmentTimeline
            segments={segments}
            onSegmentClick={setSelectedSegment}
          />

          <div className="flex gap-4 justify-center pt-4">
            <button className={buttonSecondaryClass} onClick={handleRegenerate}>
              Regenerate Segments
            </button>
            <button className={buttonPrimaryClass} onClick={onBack}>
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
