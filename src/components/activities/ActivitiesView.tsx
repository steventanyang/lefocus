import { useState, useEffect, useRef, useCallback } from "react";
import { useSessionsList, useSegmentsForSessions } from "@/hooks/queries";
import { SessionCard } from "@/components/session/SessionCard";
import { BlockView } from "@/components/activities/BlockView";
import { SessionResults } from "@/components/session/SessionResults";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { KeyBox } from "@/components/ui/KeyBox";
import { useActivitiesKeyboard } from "@/hooks/useActivitiesKeyboard";
import type { SessionSummary } from "@/types/timer";

interface ActivitiesViewProps {
  onNavigate: (view: "timer" | "activities") => void;
}

export function ActivitiesView({ onNavigate }: ActivitiesViewProps) {
  // Fetch sessions list with automatic caching
  const { data: sessions = [], isLoading: loading, error } = useSessionsList();

  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "block">("list");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const scrollPositionRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Find the scrollable parent container (the main element)
  const getScrollContainer = useCallback((): HTMLElement | null => {
    if (!containerRef.current) return null;
    let element: HTMLElement | null = containerRef.current.parentElement;
    while (element) {
      const style = window.getComputedStyle(element);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }, []);

  // Save scroll position before navigating to session
  const handleSessionClick = useCallback((session: SessionSummary) => {
    // Find the index of the clicked session
    const clickedIndex = sessions.findIndex((s) => s.id === session.id);
    if (clickedIndex !== -1) {
      setSelectedIndex(clickedIndex);
    }
    
    const scrollContainer = getScrollContainer();
    if (scrollContainer) {
      scrollPositionRef.current = scrollContainer.scrollTop;
    }
    setSelectedSession(session);
  }, [getScrollContainer, sessions]);

  // Handle keyboard shortcuts for navigation and view mode selection
  useActivitiesKeyboard({
    sessions,
    selectedIndex,
    viewMode,
    selectedSession,
    onSetViewMode: setViewMode,
    onSetSelectedIndex: setSelectedIndex,
    onSessionClick: handleSessionClick,
  });

  // Fetch segments for all sessions in parallel with automatic caching and deduplication
  const { segmentsBySession } = useSegmentsForSessions(sessions);

  // Initialize selected index when sessions load
  useEffect(() => {
    if (sessions.length > 0 && selectedIndex === null) {
      setSelectedIndex(0);
    } else if (sessions.length === 0) {
      setSelectedIndex(null);
    }
  }, [sessions.length, selectedIndex]);

  // Reset selected index when switching views
  useEffect(() => {
    if (sessions.length > 0) {
      setSelectedIndex(0);
    }
  }, [viewMode, sessions.length]);

  // Restore scroll position when coming back from session
  // This is a valid use of useEffect: synchronizing with DOM (external system)
  // We need to wait for React to finish rendering the list view before restoring scroll
  useEffect(() => {
    if (!selectedSession && scrollPositionRef.current > 0) {
      // Use double requestAnimationFrame to ensure DOM has fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scrollContainer = getScrollContainer();
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollPositionRef.current;
          }
        });
      });
    }
  }, [selectedSession]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex !== null && cardRefs.current[selectedIndex]) {
      requestAnimationFrame(() => {
        const selectedCard = cardRefs.current[selectedIndex];
        if (!selectedCard) return;

        const scrollContainer = getScrollContainer();
        if (!scrollContainer) return;

        // If we're at the top (index 0), ensure header is visible
        if (selectedIndex === 0) {
          // Scroll container to top to show header
          scrollContainer.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        } else {
          // Center the selected item
          selectedCard.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      });
    }
  }, [selectedIndex, viewMode, getScrollContainer]);

  // Restore scroll position when coming back from session
  const handleBack = () => {
    setSelectedSession(null);
  };

  const buttonPrimaryClass =
    "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-gray-300 hover:text-black";

  // Show expanded session modal
  if (selectedSession) {
    return (
      <SessionResults
        sessionId={selectedSession.id}
        session={selectedSession}
        onBack={handleBack}
        backButtonText="View Activities"
      />
    );
  }

  return (
    <div ref={containerRef} className="w-full max-w-3xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">Activities</h1>
        <div className="flex items-center gap-4">
          {/* View mode shortcuts */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("list")}
              className="text-base font-light text-gray-600 flex items-center gap-2"
            >
              <KeyBox selected={viewMode === "list"}>L</KeyBox>
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode("block")}
              className="text-base font-light text-gray-600 flex items-center gap-2"
            >
              <KeyBox selected={viewMode === "block"}>B</KeyBox>
              <span>Block</span>
            </button>
          </div>
          <button
            className="text-base font-light text-gray-600 hover:opacity-70 transition-opacity flex items-center gap-2"
            onClick={() => onNavigate("timer")}
          >
            <KeyboardShortcut keyLetter="t" />
            <span>View Timer</span>
          </button>
        </div>
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

      {/* Sessions list or block view */}
      {sessions.length > 0 && (
        <>
          {viewMode === "list" ? (
            <div className="flex flex-col gap-4">
              {sessions.map((session, index) => (
                <SessionCard
                  key={session.id}
                  ref={(el) => {
                    cardRefs.current[index] = el;
                  }}
                  session={session}
                  segments={segmentsBySession[session.id]}
                  onClick={handleSessionClick}
                  isSelected={selectedIndex === index}
                />
              ))}
            </div>
          ) : (
            <BlockView
              sessions={sessions}
              onClick={handleSessionClick}
              selectedIndex={selectedIndex}
              cardRefs={cardRefs}
            />
          )}
        </>
      )}
    </div>
  );
}
