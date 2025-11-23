import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useSessionsList, useSegmentsForSessions, useLabelsQuery } from "@/hooks/queries";
import { calculateSegmentStats } from "@/hooks/useSegments";
import { StatsStats } from "@/components/stats/StatsStats";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping } from "@/utils/keyboardUtils";
import { LabelSelectionModal } from "@/components/labels/LabelSelectionModal";
import { LabelTag } from "@/components/labels/LabelTag";
import { CustomDateRangeModal } from "@/components/stats/CustomDateRangeModal";
import { 
  TimeWindow, 
  getDateRangeForWindow, 
  isDateInRange
} from "@/utils/dateUtils";
import type { Segment } from "@/types/segment";

interface StatsViewProps {
  onNavigate: (view: "timer" | "activities" | "stats") => void;
}

export function StatsView({ onNavigate }: StatsViewProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("day");
  const [showAllApps, setShowAllApps] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"list" | "treemap">("list");
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState<boolean>(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [customDateRange, setCustomDateRange] = useState<{ start: Date; end: Date } | null>(null);

  // Fetch all sessions
  const { data: sessions = [], isLoading: sessionsLoading, error: sessionsError } = useSessionsList();

  // Fetch labels for the modal
  const { data: labels = [] } = useLabelsQuery();

  // Get current label object
  const currentLabel = useMemo(() => 
    labels.find(l => l.id === selectedLabelId) || null
  , [labels, selectedLabelId]);

  // Filter sessions by selected label
  const filteredSessions = useMemo(() => {
    if (selectedLabelId === null) return sessions;
    return sessions.filter(session => session.labelId === selectedLabelId);
  }, [sessions, selectedLabelId]);

  // Fetch segments for filtered sessions
  const { segmentsBySession, isLoading: segmentsLoading } = useSegmentsForSessions(filteredSessions);

  // Handle keyboard shortcuts for time window selection (d/w/m), view mode (t), show all toggle (v), and label filter (l)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing or custom modal is open
      if (isUserTyping() || isCustomModalOpen) {
        return;
      }

      // Check for Cmd/Ctrl/Alt modifiers (but allow Shift)
      // We want to avoid conflicts with global shortcuts like Cmd+T
      const isModifierPressed = event.metaKey || event.ctrlKey || event.altKey;
      
      // Handle view mode shortcuts first
      // t: switch to treemap view (only without Cmd/Ctrl/Alt modifiers)
      if ((event.key === "t" || event.key === "T") && !isModifierPressed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setViewMode("treemap");
        return;
      }

      // Handle 'l' key for both List view and Label modal
      if (event.key === "l" || event.key === "L") {
        // Cmd+L or Ctrl+L: open label modal
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setIsLabelModalOpen(true);
          return;
        }
        
        // L (no modifiers, allowing Shift): switch to list view
        if (!isModifierPressed) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setViewMode("list");
          return;
        }
      }

      // Only handle d/w/m/y/c/v when no modifier keys are pressed (including Shift)
      if (isModifierPressed || event.shiftKey) {
        return;
      }

      // d: day, w: week, m: month, y: year, c: custom
      if (event.key === "d" || event.key === "D") {
        event.preventDefault();
        setTimeWindow("day");
        return;
      }
      if (event.key === "w" || event.key === "W") {
        event.preventDefault();
        setTimeWindow("week");
        return;
      }
      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        setTimeWindow("month");
        return;
      }
      if (event.key === "y" || event.key === "Y") {
        event.preventDefault();
        setTimeWindow("year");
        return;
      }
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        setIsCustomModalOpen(true);
        return;
      }
      if (event.key === "v" || event.key === "V") {
        event.preventDefault();
        setShowAllApps(!showAllApps);
        return;
      }
    };

    // Use capture phase to ensure this runs before other handlers
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [showAllApps, isCustomModalOpen]);

  // Filter segments by time window
  const filteredSegments = useMemo(() => {
    let dateRange;
    if (timeWindow === "custom" && customDateRange) {
      dateRange = customDateRange;
    } else {
      dateRange = getDateRangeForWindow(timeWindow);
    }
    
    const allSegments: Segment[] = [];

    // Collect all segments from all sessions
    Object.values(segmentsBySession).forEach((segments) => {
      allSegments.push(...segments);
    });

    // Filter segments that fall within the date range
    return allSegments.filter((segment) => 
      isDateInRange(segment.startTime, dateRange)
    );
  }, [segmentsBySession, timeWindow, customDateRange]);

  // Calculate stats from filtered segments (show 5 by default, or all if showAllApps is true)
  const stats = useMemo(() => {
    return calculateSegmentStats(filteredSegments, showAllApps ? undefined : 5);
  }, [filteredSegments, showAllApps]);

  const isLoading = sessionsLoading || segmentsLoading;

  // Handle custom date modal actions
  const handleCustomDateSubmit = (range: { start: Date; end: Date }) => {
    setCustomDateRange(range);
    setTimeWindow("custom");
    setIsCustomModalOpen(false);
  };
  
  // Time window buttons for header
  const timeWindowButtons = (
    <div className="flex gap-4">
      <button
        onClick={() => setTimeWindow("day")}
        className="text-base font-light text-gray-600 flex items-center gap-2 group"
      >
        <KeyBox selected={timeWindow === "day"} hovered={false}>D</KeyBox>
        <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">day</span>
      </button>
      <button
        onClick={() => setTimeWindow("week")}
        className="text-base font-light text-gray-600 flex items-center gap-2 group"
      >
        <KeyBox selected={timeWindow === "week"} hovered={false}>W</KeyBox>
        <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">week</span>
      </button>
      <button
        onClick={() => setTimeWindow("month")}
        className="text-base font-light text-gray-600 flex items-center gap-2 group"
      >
        <KeyBox selected={timeWindow === "month"} hovered={false}>M</KeyBox>
        <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">month</span>
      </button>
      <button
        onClick={() => setTimeWindow("year")}
        className="text-base font-light text-gray-600 flex items-center gap-2 group"
      >
        <KeyBox selected={timeWindow === "year"} hovered={false}>Y</KeyBox>
        <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">year</span>
      </button>
      <button
        onClick={() => setIsCustomModalOpen(true)}
        className="text-base font-light text-gray-600 flex items-center gap-2 group"
      >
        <KeyBox selected={timeWindow === "custom"} hovered={false}>C</KeyBox>
        <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">custom</span>
      </button>
    </div>
  );

  // Label filter selector (used in StatsStats)
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
    <div className="flex items-center justify-end">
      <button 
        onClick={() => setIsLabelModalOpen(true)}
        className="flex items-center gap-1.5 group"
      >
        <div className="flex items-center gap-1">
          <KeyBox selected={isLabelModalOpen} hovered={false}>⌘</KeyBox>
          <KeyBox selected={isLabelModalOpen} hovered={false}>L</KeyBox>
        </div>
        <div className="flex items-center justify-end ml-1 mr-7">
          {labelDisplay}
        </div>
      </button>
    </div>
  );

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
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
      <div className="flex items-center justify-between px-6">
        <h1 className="text-2xl font-light tracking-wide">stats</h1>
        <div className="flex-1 flex justify-center" style={{marginLeft: '60px'}}>
          {labelFilterSelector}
        </div>
        <button
          className="text-base font-light text-gray-600 flex items-center gap-2 group"
          onClick={() => onNavigate("timer")}
        >
          <KeyboardShortcut keyLetter="t" hovered={false} />
          <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">view timer</span>
        </button>
      </div>

      {/* Loading state */}
      {isLoading && !sessionsError && (
        <StatsSkeleton
          timeWindowButtons={timeWindowButtons}
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode((prev) => (prev === "list" ? "treemap" : "list"))}
          showAllApps={showAllApps}
          onToggleShowAll={() => setShowAllApps(!showAllApps)}
        />
      )}

      {/* Error state */}
      {sessionsError && (
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {sessionsError instanceof Error ? sessionsError.message : "failed to load stats"}
        </div>
      )}

      {/* Stats display */}
      {!isLoading && !sessionsError && (
        <div className="bg-white">
          <StatsStats
            stats={stats}
            showAllApps={showAllApps}
            onToggleShowAll={() => setShowAllApps(!showAllApps)}
            viewMode={viewMode}
            onToggleViewMode={() => setViewMode((prev) => (prev === "list" ? "treemap" : "list"))}
            timeWindowSelector={timeWindowButtons}
            timeWindow={timeWindow}
            customDateRange={customDateRange}
          />
        </div>
      )}

      {/* Custom Date Range Modal */}
      <CustomDateRangeModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSubmit={handleCustomDateSubmit}
      />
    </div>
  );
}

interface StatsSkeletonProps {
  timeWindowButtons: ReactNode;
  viewMode: "list" | "treemap";
  onToggleViewMode: () => void;
  showAllApps: boolean;
  onToggleShowAll: () => void;
}

const SkeletonBar = ({ className = "" }: { className?: string }) => (
  <div className={`skeleton-bar bg-gray-200 rounded ${className}`} />
);

function StatsSkeleton({
  timeWindowButtons,
  viewMode,
  onToggleViewMode,
  showAllApps,
  onToggleShowAll,
}: StatsSkeletonProps) {
  return (
    <div className="bg-white">
      <div className="p-6 flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <div className="text-xl font-light tracking-wide text-gray-800">
              total duration
            </div>
            <SkeletonBar className="h-8 w-32" />
          </div>
          <div className="flex gap-2 pt-0.5">
            {timeWindowButtons}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-normal tracking-wide text-gray-800">
                top applications
              </h3>
              <button
                onClick={onToggleShowAll}
                className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-1"
              >
                <KeyBox selected={showAllApps} hovered={false}>V</KeyBox>
                {showAllApps ? "view top apps" : "view all"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onToggleViewMode} className="flex items-center gap-1">
                <KeyBox selected={viewMode === "list"} hovered={false}>L</KeyBox>
                <span className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors">
                  list
                </span>
              </button>
              <button onClick={onToggleViewMode} className="flex items-center gap-1">
                <KeyBox selected={viewMode === "treemap"} hovered={false}>T</KeyBox>
                <span className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors">
                  treemap
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 w-full text-left">
                <SkeletonBar className="w-8 h-8" />
                <div className="flex-1 flex flex-col gap-2">
                  <SkeletonBar className="h-4 w-1/2" />
                  <SkeletonBar className="h-2 w-full" />
                </div>
                <SkeletonBar className="h-5 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

