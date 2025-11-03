import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Segment } from "../types/segment";
import { useSegments, calculateSegmentStats } from "../hooks/useSegments";
import { SegmentStats } from "./SegmentStats";
import { SegmentDetailsModal } from "./SegmentDetailsModal";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig } from "../types/app-config";

interface SessionResultsProps {
  sessionId: string;
  onBack: () => void;
  backButtonText?: string;
}

export function SessionResults({ sessionId, onBack, backButtonText = "Back to Timer" }: SessionResultsProps) {
  const { segments, loading, error } = useSegments(sessionId);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const queryClient = useQueryClient();

  const stats = calculateSegmentStats(segments);

  // Extract unique bundleIds from segments
  const bundleIds = useMemo(() => {
    return [...new Set(segments.map((seg) => seg.bundleId))];
  }, [segments]);

  // Prefetch app configs for all unique bundleIds
  useEffect(() => {
    if (bundleIds.length === 0) return;

    bundleIds.forEach((bundleId) => {
      queryClient.prefetchQuery({
        queryKey: ["app-config", bundleId],
        queryFn: async () => {
          const config = await invoke<AppConfig | null>("get_app_config", {
            bundleId,
          });
          return config;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    });
  }, [bundleIds, queryClient]);

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
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">{error}</div>
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
