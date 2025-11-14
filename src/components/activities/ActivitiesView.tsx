import { useState } from "react";
import { useSessionsList, useSegmentsForSessions } from "@/hooks/queries";
import { SessionCard } from "@/components/session/SessionCard";
import { SessionResults } from "@/components/session/SessionResults";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import type { SessionSummary } from "@/types/timer";

interface ActivitiesViewProps {
  onNavigate: (view: "timer" | "activities") => void;
}

export function ActivitiesView({ onNavigate }: ActivitiesViewProps) {
  // Fetch sessions list with automatic caching
  const { data: sessions = [], isLoading: loading, error } = useSessionsList();

  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);

  // Fetch segments for all sessions in parallel with automatic caching and deduplication
  const { segmentsBySession } = useSegmentsForSessions(sessions);

  const buttonPrimaryClass =
    "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white";

  // Show expanded session modal
  if (selectedSession) {
    return (
      <SessionResults
        sessionId={selectedSession.id}
        session={selectedSession}
        onBack={() => setSelectedSession(null)}
        backButtonText="View Activities"
      />
    );
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">Activities</h1>
        <button
          className="text-base font-light hover:opacity-70 transition-opacity flex items-center gap-2"
          onClick={() => onNavigate("timer")}
        >
          <KeyboardShortcut keyLetter="t" />
          <span>View Timer</span>
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
          {error instanceof Error ? error.message : "Failed to load sessions"}
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
              onClick={setSelectedSession}
            />
          ))}
        </div>
      )}
    </div>
  );
}
