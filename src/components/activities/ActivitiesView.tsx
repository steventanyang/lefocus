import { useState, useEffect, useRef, useCallback } from "react";
import {
  useSessionsListInfinite,
  useSegmentsForSessions,
  useLabelsQuery,
  useDeleteSessionMutation,
} from "@/hooks/queries";
import { SessionCard } from "@/components/session/SessionCard";
import { BlockView } from "@/components/activities/BlockView";
import { SessionResults } from "@/components/session/SessionResults";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { KeyBox } from "@/components/ui/KeyBox";
import { useActivitiesKeyboard } from "@/hooks/useActivitiesKeyboard";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LabelSelectionModal } from "@/components/labels/LabelSelectionModal";
import { LabelTag } from "@/components/labels/LabelTag";
import { isUserTyping } from "@/utils/keyboardUtils";
import type { SessionSummary } from "@/types/timer";

interface ActivitiesViewProps {
  onNavigate: (view: "timer" | "activities") => void;
}

export function ActivitiesView({ onNavigate }: ActivitiesViewProps) {
  // Fetch paginated sessions list with infinite scroll
  const {
    data,
    isLoading: loading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSessionsListInfinite();

  // Flatten pages into a single array
  const sessions = data?.pages.flat() ?? [];

  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(
    null
  );
  const [viewMode, setViewMode] = useState<"list" | "block">("list");
  const [selectedIndexState, setSelectedIndexState] = useState<number | null>(
    null
  );
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState<boolean>(false);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<
    string | null
  >(null);

  const deleteSessionMutation = useDeleteSessionMutation();

  const scrollPositionRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
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

  // Fetch labels for display in session cards
  const { data: labels = [] } = useLabelsQuery();

  // Get current label object
  const currentLabel = labels.find((l) => l.id === selectedLabelId) || null;

  // Filter sessions by selected label
  const filteredSessions = sessions.filter((session) =>
    selectedLabelId === null ? true : session.labelId === selectedLabelId
  );

  // Derive selectedIndex: auto-initialize to 0 when sessions load, null when empty
  const selectedIndex =
    filteredSessions.length > 0 ? (selectedIndexState ?? 0) : null;

  // Fetch segments for all sessions in parallel with automatic caching and deduplication
  const { segmentsBySession } = useSegmentsForSessions(filteredSessions);

  // Wrapper to set selectedIndex and clear delete confirmation
  const handleSetSelectedIndex = useCallback(
    (index: number | null | ((prev: number | null) => number | null)) => {
      setSelectedIndexState(index);
      setDeleteConfirmSessionId(null);
    },
    []
  );

  // Wrapper to set viewMode and reset selection/delete confirmation
  const handleSetViewMode = useCallback(
    (mode: "list" | "block") => {
      setViewMode(mode);
      if (filteredSessions.length > 0) {
        setSelectedIndexState(0);
      }
      setDeleteConfirmSessionId(null);
    },
    [filteredSessions.length]
  );

  // Save scroll position before navigating to session
  const handleSessionClick = useCallback(
    (session: SessionSummary) => {
      // Find the index of the clicked session
      const clickedIndex = filteredSessions.findIndex(
        (s) => s.id === session.id
      );
      if (clickedIndex !== -1) {
        handleSetSelectedIndex(clickedIndex);
      }

      const scrollContainer = getScrollContainer();
      if (scrollContainer) {
        scrollPositionRef.current = scrollContainer.scrollTop;
      }
      setSelectedSession(session);
    },
    [getScrollContainer, filteredSessions, handleSetSelectedIndex]
  );

  // Handle keyboard shortcuts for navigation and view mode selection
  useActivitiesKeyboard({
    sessions: filteredSessions,
    selectedIndex,
    viewMode,
    selectedSession,
    onSetViewMode: handleSetViewMode,
    onSetSelectedIndex: handleSetSelectedIndex,
    onSessionClick: handleSessionClick,
  });

  // Virtualizer for list view
  const virtualizer = useVirtualizer({
    count: filteredSessions.length,
    getScrollElement: () => {
      // Find the scrollable parent container
      if (!listContainerRef.current) return null;
      let element: HTMLElement | null = listContainerRef.current.parentElement;
      while (element) {
        const style = window.getComputedStyle(element);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          return element;
        }
        element = element.parentElement;
      }
      return null;
    },
    estimateSize: () => 200, // Estimate height for each card (will be measured)
    overscan: 5, // Render 5 extra items outside viewport for smooth scrolling
    enabled: viewMode === "list" && filteredSessions.length > 0,
  });

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

  // Scroll detection for infinite loading
  useEffect(() => {
    if (
      viewMode !== "list" ||
      !virtualizer ||
      !hasNextPage ||
      isFetchingNextPage
    ) {
      return;
    }

    const scrollElement = getScrollContainer();
    if (!scrollElement) {
      return;
    }

    const checkScrollPosition = () => {
      const virtualItems = virtualizer.getVirtualItems();
      if (virtualItems.length === 0) {
        return;
      }

      // Get the last visible item index
      const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index;
      if (lastVisibleIndex === undefined) {
        return;
      }

      // Trigger fetch when within 5 items of the end
      const threshold = 5;
      if (lastVisibleIndex >= filteredSessions.length - threshold) {
        fetchNextPage();
      }
    };

    // Check immediately
    checkScrollPosition();

    // Also listen to scroll events for more responsive loading
    scrollElement.addEventListener("scroll", checkScrollPosition, {
      passive: true,
    });

    return () => {
      scrollElement.removeEventListener("scroll", checkScrollPosition);
    };
  }, [
    viewMode,
    virtualizer,
    hasNextPage,
    isFetchingNextPage,
    filteredSessions.length,
    fetchNextPage,
    getScrollContainer,
  ]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex === null) return;

    if (viewMode === "list" && virtualizer) {
      // Use virtualizer's scrollToIndex for list view
      // Use 'auto' instead of 'smooth' because smooth doesn't work well with dynamic sizing
      // Wait a frame to ensure the item is rendered and measured
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (selectedIndex === 0) {
            const scrollContainer = getScrollContainer();
            if (scrollContainer) {
              scrollContainer.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }
          } else {
            // scrollToIndex will handle ensuring the item is rendered
            virtualizer.scrollToIndex(selectedIndex, {
              align: "center",
              behavior: "auto", // Changed from 'smooth' to avoid dynamic size warnings
            });
          }
        });
      });
    } else if (viewMode === "block" && cardRefs.current[selectedIndex]) {
      // Original behavior for block view
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
  }, [selectedIndex, viewMode, getScrollContainer, virtualizer]);

  // Handle keyboard shortcuts for deletion
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing, session details open, or label modal open
      if (isUserTyping() || selectedSession || isLabelModalOpen) {
        return;
      }

      if (selectedIndex === null) return;
      const session = filteredSessions[selectedIndex];
      if (!session) return;

      // D key
      if (event.key === "d" || event.key === "D") {
        if (event.metaKey || event.ctrlKey) {
          // Cmd+D: Confirm delete if in confirmation mode
          if (deleteConfirmSessionId === session.id) {
            event.preventDefault();
            event.stopPropagation();
            deleteSessionMutation.mutate(session.id);
            setDeleteConfirmSessionId(null);
          }
        } else {
          // D: Initiate confirmation
          event.preventDefault();
          event.stopPropagation();
          setDeleteConfirmSessionId(session.id);
        }
      }
      // Esc key
      else if (event.key === "Escape") {
        if (deleteConfirmSessionId) {
          event.preventDefault();
          event.stopPropagation();
          setDeleteConfirmSessionId(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    selectedIndex,
    filteredSessions,
    selectedSession,
    isLabelModalOpen,
    deleteConfirmSessionId,
    deleteSessionMutation,
  ]);

  // Auto-clear delete confirmation after 5 seconds
  useEffect(() => {
    if (deleteConfirmSessionId) {
      const timeoutId = setTimeout(() => {
        setDeleteConfirmSessionId(null);
      }, 5000); // 5 seconds

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [deleteConfirmSessionId]);

  // Handle keyboard shortcuts for label filtering
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing or session is selected
      if (isUserTyping() || selectedSession) {
        return;
      }

      // Cmd+L or Ctrl+L: open label modal
      if (
        (event.key === "l" || event.key === "L") &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setIsLabelModalOpen(true);
        return;
      }
    };

    // Use capture phase to ensure this runs before other handlers
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [selectedSession]);

  // Restore scroll position when coming back from session
  const handleBack = () => {
    setSelectedSession(null);
  };

  // Label filter selector (used in header)
  const labelDisplay = currentLabel ? (
    <LabelTag
      label={currentLabel}
      size="medium"
      selected={true}
      maxWidth="126px"
      showEmptyFrame
    />
  ) : (
    <span className="text-base font-light text-gray-600">all labels</span>
  );

  const labelFilterSelector = (
    <button
      onClick={() => setIsLabelModalOpen(true)}
      className="flex items-center gap-1.5 group"
    >
      <div className="flex items-center gap-1">
        <KeyBox selected={isLabelModalOpen} hovered={false}>
          ⌘
        </KeyBox>
        <KeyBox selected={isLabelModalOpen} hovered={false}>
          L
        </KeyBox>
      </div>
      <div className="flex items-center justify-start min-w-[126px] ml-1 mr-4">
        {labelDisplay}
      </div>
    </button>
  );

  const buttonPrimaryClass =
    "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-gray-300 hover:text-black";

  // Show expanded session modal
  if (selectedSession) {
    return (
      <SessionResults
        sessionId={selectedSession.id}
        session={selectedSession}
        onBack={handleBack}
        backButtonText="view activities"
      />
    );
  }

  return (
    <div ref={containerRef} className="w-full max-w-3xl flex flex-col gap-8">
      {/* Label Selection Modal */}
      <LabelSelectionModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        labels={labels}
        currentLabelId={selectedLabelId}
        onSelectLabel={(id) => {
          setSelectedLabelId(id);
          setIsLabelModalOpen(false);
        }}
        onAddNew={() => {}} // Not needed here as we hide the add new button
        showAddNew={false}
        noLabelText="all labels"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">activities</h1>
        <div
          className="flex-1 flex justify-center"
          style={{ marginLeft: "60px" }}
        >
          {labelFilterSelector}
        </div>
        <button
          className="text-base font-light text-gray-600 hover:opacity-70 transition-opacity flex items-center gap-2"
          onClick={() => onNavigate("timer")}
        >
          <KeyboardShortcut keyLetter="t" />
          <span>view timer</span>
        </button>
      </div>

      {/* View mode selector row */}
      <div className="flex items-center justify-end">
        {/* View mode shortcuts */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSetViewMode("list")}
            className="text-base font-light text-gray-600 flex items-center gap-2"
          >
            <KeyBox selected={viewMode === "list"}>L</KeyBox>
            <span>list</span>
          </button>
          <button
            onClick={() => handleSetViewMode("block")}
            className="text-base font-light text-gray-600 flex items-center gap-2"
          >
            <KeyBox selected={viewMode === "block"}>B</KeyBox>
            <span>block</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && sessions.length === 0 && (
        <div className="text-base font-light text-center p-8">
          loading sessions...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {error instanceof Error ? error.message : "failed to load sessions"}
        </div>
      )}

      {/* Empty state */}
      {!loading &&
        !error &&
        (filteredSessions.length === 0 && sessions.length > 0 ? (
          <div className="text-center p-12 px-8 flex flex-col gap-4 border border-black">
            <p className="text-base font-normal">no sessions with this label</p>
            <p className="text-sm font-light text-gray-600">
              try a different label or view all sessions
            </p>
            <button
              className={buttonPrimaryClass}
              onClick={() => setSelectedLabelId(null)}
            >
              view all sessions
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center p-12 px-8 flex flex-col gap-4 border border-black">
            <p className="text-base font-normal">no past sessions yet</p>
            <p className="text-sm font-light text-gray-600">
              complete a focus session to see it here
            </p>
            <button
              className={buttonPrimaryClass}
              onClick={() => onNavigate("timer")}
            >
              start new session
            </button>
          </div>
        ) : null)}

      {/* Sessions list or block view */}
      {filteredSessions.length > 0 && (
        <>
          {viewMode === "list" ? (
            <>
              <div
                ref={listContainerRef}
                className="flex flex-col"
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const session = filteredSessions[virtualItem.index];
                  return (
                    <div
                      key={session.id}
                      data-index={virtualItem.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <div className="mb-4">
                        <SessionCard
                          ref={(el) => {
                            cardRefs.current[virtualItem.index] = el;
                          }}
                          session={session}
                          segments={segmentsBySession[session.id]}
                          labels={labels}
                          onClick={handleSessionClick}
                          isSelected={selectedIndex === virtualItem.index}
                          isDeleteConfirm={
                            deleteConfirmSessionId === session.id
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Loading indicator for next page */}
              {isFetchingNextPage && (
                <div className="text-base font-light text-center p-4">
                  loading more sessions...
                </div>
              )}
            </>
          ) : (
            <BlockView
              sessions={filteredSessions}
              labels={labels}
              onClick={handleSessionClick}
              selectedIndex={selectedIndex}
              cardRefs={cardRefs}
              deleteConfirmSessionId={deleteConfirmSessionId}
            />
          )}
        </>
      )}
    </div>
  );
}
