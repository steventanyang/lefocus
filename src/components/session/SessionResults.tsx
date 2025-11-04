import { useState } from "react";
import { Segment } from "@/types/segment";
import { useSegments } from "@/hooks/queries";
import { calculateSegmentStats } from "@/hooks/useSegments";
import { SegmentStats } from "@/components/segments/SegmentStats";
import { SegmentDetailsModal } from "@/components/segments/SegmentDetailsModal";

interface SessionResultsProps {
  sessionId: string;
  onBack: () => void;
  backButtonText?: string;
}

export function SessionResults({ sessionId, onBack, backButtonText = "Back to Timer" }: SessionResultsProps) {
  const { data: segments = [], isLoading: loading, error } = useSegments(sessionId);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);

  const stats = calculateSegmentStats(segments);

  const buttonPrimaryClass = "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white";

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
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {error instanceof Error ? error.message : "Failed to load segments"}
        </div>
        <button className={buttonPrimaryClass} onClick={onBack}>
          {backButtonText}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
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
          <SegmentStats
            stats={stats}
            segments={segments}
            onSegmentClick={setSelectedSegment}
          />

          <div className="flex gap-4 justify-center pt-4">
            <button className={buttonPrimaryClass} onClick={onBack}>
              {backButtonText}
            </button>
          </div>
        </div>
      )}

      {selectedSegment && (
        <SegmentDetailsModal
          segment={selectedSegment}
          onClose={() => setSelectedSegment(null)}
        />
      )}
    </div>
  );
}
