import { useState, useEffect } from "react";
import { Segment } from "@/types/segment";
import { useSegments } from "@/hooks/queries";
import { calculateSegmentStats } from "@/hooks/useSegments";
import { SegmentStats } from "@/components/segments/SegmentStats";
import { SegmentDetailsModal } from "@/components/segments/SegmentDetailsModal";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { isUserTyping, isMac } from "@/utils/keyboardUtils";
import type { SessionStatus } from "@/types/timer";

type SessionDescriptor = {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  status: SessionStatus;
  targetMs: number;
  activeMs: number;
};

interface SessionResultsProps {
  sessionId: string;
  session?: SessionDescriptor | null;
  onBack: () => void;
  backButtonText?: string;
}

export function SessionResults({
  sessionId,
  session,
  onBack,
  backButtonText = "View Timer",
}: SessionResultsProps) {
  const { data: segments = [], isLoading: loading, error } = useSegments(sessionId);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);

  // Handle keyboard shortcuts for navigation
  // When backButtonText is "View Activities", Cmd+A should close the session
  // When backButtonText is "View Timer", Cmd+T should close the session
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;

      if (backButtonText === "View Activities") {
        // Cmd+A (Mac) or Ctrl+A (non-Mac): Close the session (go back to activities list)
        if (event.key === "a" && isModifierPressed) {
          event.preventDefault();
          event.stopPropagation(); // Prevent global handler from firing
          onBack();
          return;
        }
      } else if (backButtonText === "View Timer") {
        // Cmd+T (Mac) or Ctrl+T (non-Mac): Close the session (go back to timer)
        if (event.key === "t" && isModifierPressed) {
          event.preventDefault();
          event.stopPropagation(); // Prevent global handler from firing
          onBack();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true); // Use capture phase to intercept before global handler

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onBack, backButtonText]);

  const stats = calculateSegmentStats(segments, 5); // Limit to top 5 apps for session view
  const sessionDurationSecs =
    typeof session?.activeMs === "number"
      ? Math.max(0, Math.floor(session.activeMs / 1000))
      : undefined;
  const statsWithDurationOverride = sessionDurationSecs != null
    ? { ...stats, totalDurationSecs: sessionDurationSecs }
    : stats;

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

  // Determine which shortcut to show based on backButtonText
  const shortcutKey = backButtonText === "View Activities" ? "a" : "t";
  
  const backButton = (
    <button
      className="text-base font-light hover:opacity-70 transition-opacity flex items-center gap-2"
      onClick={onBack}
    >
      <KeyboardShortcut keyLetter={shortcutKey} />
      <span>{backButtonText}</span>
    </button>
  );

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
        <SegmentStats
          stats={statsWithDurationOverride}
          segments={segments}
          onSegmentClick={setSelectedSegment}
          backButton={backButton}
          dateTime={session?.startedAt}
        />
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
