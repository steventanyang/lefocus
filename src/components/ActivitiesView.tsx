import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionsList } from "../hooks/useSessionsList";
import { SessionCard } from "./SessionCard";
import { SessionResults } from "./SessionResults";
import { Segment } from "../types/segment";

interface ActivitiesViewProps {
  onNavigate: (view: "timer" | "activities") => void;
}

export function ActivitiesView({ onNavigate }: ActivitiesViewProps) {
  const { sessions, loading, error } = useSessionsList();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [segmentsBySession, setSegmentsBySession] = useState<
    Record<string, Segment[]>
  >({});
  const [segmentsLoading, setSegmentsLoading] = useState(false);

  // Fetch segments for all sessions
  useEffect(() => {
    if (sessions.length === 0) {
      setSegmentsBySession({});
      setSegmentsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAllSegments = async () => {
      setSegmentsLoading(true);
      const segmentsMap: Record<string, Segment[]> = {};

      // Fetch segments for all sessions in parallel
      await Promise.all(
        sessions.map(async (session) => {
          try {
            const segments = await invoke<Segment[]>(
              "get_segments_for_session",
              { sessionId: session.id }
            );
            if (!cancelled) {
              segmentsMap[session.id] = segments || [];
            }
          } catch (err) {
            // If segments fail to load, just leave empty array
            if (!cancelled) {
              console.error(`Failed to load segments for session ${session.id}:`, err);
              segmentsMap[session.id] = [];
            }
          }
        })
      );

      if (!cancelled) {
        setSegmentsBySession(segmentsMap);
        setSegmentsLoading(false);
      }
    };

    fetchAllSegments();

    return () => {
      cancelled = true;
    };
  }, [sessions]);

  const buttonPrimaryClass =
    "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white";

  // Show expanded session modal
  if (selectedSessionId) {
    return (
      <SessionResults
        sessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
        backButtonText="Back to Activities"
      />
    );
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">Activities</h1>
        <button
          className="text-sm font-light border border-black px-3 py-1 hover:bg-black hover:text-white transition-colors"
          onClick={() => onNavigate("timer")}
        >
          ← Back to Timer
        </button>
      </div>

      {/* Loading state */}
      {loading && sessions.length === 0 && (
        <div className="text-base font-light text-center p-8">
          Loading sessions...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sessions.length === 0 && (
        <div className="text-center p-12 px-8 flex flex-col gap-4 border border-black">
          <p className="text-base font-normal">No past sessions yet</p>
          <p className="text-sm font-light text-gray-600">
            Complete a focus session to see it here
          </p>
          <button
            className={buttonPrimaryClass}
            onClick={() => onNavigate("timer")}
          >
            Start New Session
          </button>
        </div>
      )}

      {/* Sessions list */}
      {sessions.length > 0 && (
        <div className="flex flex-col gap-4">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              segments={segmentsBySession[session.id]}
              onClick={setSelectedSessionId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
