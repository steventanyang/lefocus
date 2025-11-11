import { useState, useEffect } from "react";
import { Segment } from "@/types/segment";
import { useSegments } from "@/hooks/queries";
import { calculateSegmentStats } from "@/hooks/useSegments";
import { SegmentStats } from "@/components/segments/SegmentStats";
import { SegmentDetailsModal } from "@/components/segments/SegmentDetailsModal";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import type { SessionStatus } from "@/types/timer";

function isUserTyping(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  const tagName = activeElement.tagName.toLowerCase();
  const isInput = tagName === "input";
  const isTextarea = tagName === "textarea";
  const isContentEditable = activeElement.getAttribute("contenteditable") === "true";
  return isInput || isTextarea || isContentEditable;
}

function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

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

  // Handle Cmd+A when viewing session results from Activities view
  // When backButtonText is "View Activities", Cmd+A should close the session
  // When backButtonText is "View Timer", let the global handler navigate to Activities
  useEffect(() => {
    // Only intercept if we're in Activities view (backButtonText === "View Activities")
    if (backButtonText !== "View Activities") {
      return; // Let global handler work
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;

      // Cmd+A (Mac) or Ctrl+A (non-Mac): Close the session (go back to activities list)
      if (event.key === "a" && isModifierPressed) {
        event.preventDefault();
        event.stopPropagation(); // Prevent global handler from firing
        onBack();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true); // Use capture phase to intercept before global handler

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onBack, backButtonText]);

  const stats = calculateSegmentStats(segments);
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
