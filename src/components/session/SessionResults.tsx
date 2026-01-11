import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Segment } from "@/types/segment";
import { useSegments, useUpdateSessionLabelMutation } from "@/hooks/queries";
import { calculateSegmentStats } from "@/hooks/useSegments";
import { SegmentStats } from "@/components/segments/SegmentStats";
import { SegmentDetailsModal } from "@/components/segments/SegmentDetailsModal";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { LabelTag } from "@/components/labels/LabelTag";
import { LabelSelectionModal } from "@/components/labels/LabelSelectionModal";
import { LabelModal } from "@/components/labels/LabelModal";
import { useLabels, useLabelById } from "@/hooks/useLabels";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping, isMac } from "@/utils/keyboardUtils";
import type { SessionStatus } from "@/types/timer";

type SessionDescriptor = {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  status: SessionStatus;
  targetMs: number;
  activeMs: number;
  labelId?: number | null;
  note?: string | null;
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
  backButtonText = "view timer",
}: SessionResultsProps) {
  const { data: segments = [], isLoading: loading, error } = useSegments(sessionId);
  const updateSessionLabelMutation = useUpdateSessionLabelMutation();
  const { labels, setLastUsedLabelId } = useLabels();

  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [currentLabelId, setCurrentLabelId] = useState<number | null>(session?.labelId ?? null);
  const [isLabelSelectionModalOpen, setIsLabelSelectionModalOpen] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);

  const currentLabel = useLabelById(currentLabelId, labels);

  // Update currentLabelId when session prop changes
  useEffect(() => {
    setCurrentLabelId(session?.labelId ?? null);
  }, [session?.labelId]);

  // Handle keyboard shortcuts for navigation and labels
  const showEmptyState = !loading && !error && segments.length === 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing or any modal is open
      if (isUserTyping() || isLabelSelectionModalOpen || isLabelModalOpen) {
        return;
      }

      const isModifierPressed = isMac() ? event.metaKey : event.ctrlKey;

      if (showEmptyState) {
        const key = event.key.toLowerCase();
        if (!isModifierPressed && (key === "enter" || key === "return")) {
          event.preventDefault();
          event.stopPropagation();
          onBack();
          return;
        }
      }

      // L key: Open label selection modal
      if ((event.key === "l" || event.key === "L") && !isModifierPressed) {
        event.preventDefault();
        setIsLabelSelectionModalOpen((prev) => !prev);
        return;
      }

      if (backButtonText === "view activities") {
        // Cmd+A (Mac) or Ctrl+A (non-Mac): Close the session (go back to activities list)
        if (event.key === "a" && isModifierPressed) {
          event.preventDefault();
          event.stopPropagation(); // Prevent global handler from firing
          onBack();
          return;
        }
      } else if (backButtonText === "view timer") {
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
  }, [onBack, backButtonText, isLabelSelectionModalOpen, isLabelModalOpen, showEmptyState]);

  const stats = calculateSegmentStats(segments, 5); // Limit to top 5 apps for session view
  const sessionDurationSecs =
    typeof session?.activeMs === "number"
      ? Math.max(0, Math.floor(session.activeMs / 1000))
      : undefined;
  const statsWithDurationOverride = sessionDurationSecs != null
    ? { ...stats, totalDurationSecs: sessionDurationSecs }
    : stats;

  const buttonPrimaryClass = "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-gray-300 hover:text-black";

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
  const shortcutKey = backButtonText === "view activities" ? "a" : "t";
  
  const backButton = (
    <button
      className="text-base font-light text-gray-600 flex items-center gap-2 group"
      onClick={onBack}
    >
      <KeyboardShortcut keyLetter={shortcutKey} hovered={false} />
      <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">{backButtonText}</span>
    </button>
  );

  const labelSection = {
    labelKey: <KeyBox hovered={false}>L</KeyBox>,
    labelTag: (
      <button
        onClick={() => setIsLabelSelectionModalOpen(true)}
        className="group ml-1.5 mr-11"
      >
        <LabelTag label={currentLabel} showEmptyFrame />
      </button>
    ),
  };

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      {/* Label Selection Modal */}
      <LabelSelectionModal
        isOpen={isLabelSelectionModalOpen}
        onClose={() => setIsLabelSelectionModalOpen(false)}
        labels={labels}
        currentLabelId={currentLabelId}
        onSelectLabel={async (labelId) => {
          setCurrentLabelId(labelId);
          setLastUsedLabelId(labelId);
          setIsLabelSelectionModalOpen(false);
          try {
            await updateSessionLabelMutation.mutateAsync({
              sessionId,
              labelId,
            });
          } catch (err) {
            console.error("Failed to update session label:", err);
          }
        }}
        onAddNew={() => {
          setIsLabelSelectionModalOpen(false);
          setIsLabelModalOpen(true);
        }}
      />

      {/* Label Create Modal */}
      <LabelModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        mode="create"
        autoAssignToSessionId={sessionId}
        existingLabels={labels}
        onLabelCreated={(labelId) => {
          setCurrentLabelId(labelId);
          setLastUsedLabelId(labelId);
        }}
      />

      {showEmptyState ? (
        <div className="text-center p-12 px-8 flex flex-col gap-4">
          <p>No segments were generated for this session.</p>
          <p className="text-sm font-light text-gray-600">
            This may happen if the session was too short or no context readings
            were captured.
          </p>
          <div className="fixed bottom-8 right-8 flex flex-col items-start gap-2">
            <KeyBox className="w-16 h-6 px-2 py-1">return</KeyBox>
            <button
              onClick={onBack}
              className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer w-[160px] hover:bg-black hover:text-white"
            >
              Go Back
            </button>
          </div>
        </div>
      ) : (
        <SegmentStats
          stats={statsWithDurationOverride}
          segments={segments}
          onSegmentClick={setSelectedSegment}
          backButton={backButton}
          labelSection={labelSection}
          dateTime={session?.startedAt}
          sessionId={sessionId}
          initialNote={session?.note}
        />
      )}

      {selectedSegment && (
        <SegmentDetailsModal
          segment={selectedSegment}
          onClose={() => setSelectedSegment(null)}
        />
      )}

      {showEmptyState && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-8 right-8 flex flex-col items-start gap-2 z-10">
            <KeyBox className="w-16 h-6 px-2 py-1">return</KeyBox>
            <button
              onClick={onBack}
              className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer w-[160px] hover:bg-black hover:text-white"
            >
              Go Back
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
