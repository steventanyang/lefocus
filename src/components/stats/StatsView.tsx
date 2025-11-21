import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useSessionsList, useSegmentsForSessions } from "@/hooks/queries";
import { calculateSegmentStats } from "@/hooks/useSegments";
import { StatsStats } from "@/components/stats/StatsStats";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping } from "@/utils/keyboardUtils";
import { 
  TimeWindow, 
  getDateRangeForWindow, 
  isDateInRange,
  getTimeWindowLabel 
} from "@/utils/dateUtils";
import type { Segment } from "@/types/segment";

interface StatsViewProps {
  onNavigate: (view: "timer" | "activities" | "stats") => void;
}

export function StatsView({ onNavigate }: StatsViewProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("day");
  const [showAllApps, setShowAllApps] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"list" | "treemap">("list");

  // Fetch all sessions
  const { data: sessions = [], isLoading: sessionsLoading, error: sessionsError } = useSessionsList();

  // Fetch all segments for all sessions
  const { segmentsBySession, isLoading: segmentsLoading } = useSegmentsForSessions(sessions);

  // Handle keyboard shortcuts for time window selection (d/w/m) and view mode (t/l)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      // Check for Cmd/Ctrl/Alt modifiers (but allow Shift)
      // We want to avoid conflicts with global shortcuts like Cmd+T
      const isModifierPressed = event.metaKey || event.ctrlKey || event.altKey;
      
      // Handle view mode shortcuts first (t/l) - these should work even with Shift
      // t: switch to treemap view (only without Cmd/Ctrl/Alt modifiers)
      if ((event.key === "t" || event.key === "T") && !isModifierPressed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setViewMode("treemap");
        return;
      }

      // l: switch to list view (only without Cmd/Ctrl/Alt modifiers)
      if ((event.key === "l" || event.key === "L") && !isModifierPressed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setViewMode("list");
        return;
      }

      // Only handle d/w/m when no modifier keys are pressed (including Shift)
      if (isModifierPressed || event.shiftKey) {
        return;
      }

      // d: day, w: week, m: month
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
    };

    // Use capture phase to ensure this runs before other handlers
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  // Filter segments by time window
  const filteredSegments = useMemo(() => {
    const dateRange = getDateRangeForWindow(timeWindow);
    const allSegments: Segment[] = [];

    // Collect all segments from all sessions
    Object.values(segmentsBySession).forEach((segments) => {
      allSegments.push(...segments);
    });

    // Filter segments that fall within the date range
    return allSegments.filter((segment) => 
      isDateInRange(segment.startTime, dateRange)
    );
  }, [segmentsBySession, timeWindow]);

  // Calculate stats from filtered segments (show 5 by default, or all if showAllApps is true)
  const stats = useMemo(() => {
    return calculateSegmentStats(filteredSegments, showAllApps ? undefined : 5);
  }, [filteredSegments, showAllApps]);

  const isLoading = sessionsLoading || segmentsLoading;
  const timeWindowLabel = getTimeWindowLabel(timeWindow);
  const timeWindowSelector = (
    <div className="flex gap-2">
      <button
        onClick={() => setTimeWindow("day")}
        className="text-base font-light flex items-center gap-2 flex-1 justify-center group"
      >
        <KeyBox selected={timeWindow === "day"} hovered={false}>D</KeyBox>
        <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Day</span>
      </button>
      <button
        onClick={() => setTimeWindow("week")}
        className="text-base font-light flex items-center gap-2 flex-1 justify-center group"
      >
        <KeyBox selected={timeWindow === "week"} hovered={false}>W</KeyBox>
        <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Week</span>
      </button>
      <button
        onClick={() => setTimeWindow("month")}
        className="text-base font-light flex items-center gap-2 flex-1 justify-center group"
      >
        <KeyBox selected={timeWindow === "month"} hovered={false}>M</KeyBox>
        <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Month</span>
      </button>
    </div>
  );

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">Stats</h1>
        <button
          className="text-base font-light text-gray-600 flex items-center gap-2 group"
          onClick={() => onNavigate("timer")}
        >
          <KeyboardShortcut keyLetter="t" hovered={false} />
          <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">View Timer</span>
        </button>
      </div>

      {/* Loading state */}
      {isLoading && !sessionsError && (
        <StatsSkeleton
          timeWindowSelector={timeWindowSelector}
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode((prev) => (prev === "list" ? "treemap" : "list"))}
          showAllApps={showAllApps}
          onToggleShowAll={() => setShowAllApps(!showAllApps)}
        />
      )}

      {/* Error state */}
      {sessionsError && (
        <div className="text-sm font-normal text-center p-4 border border-black bg-transparent max-w-full">
          {sessionsError instanceof Error ? sessionsError.message : "Failed to load stats"}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !sessionsError && filteredSegments.length === 0 && (
        <div className="text-center p-12 px-8 flex flex-col gap-4 border border-black">
          <p className="text-base font-normal">No data for {timeWindowLabel.toLowerCase()}</p>
          <p className="text-sm font-light text-gray-600">
            Complete focus sessions to see stats here
          </p>
        </div>
      )}

      {/* Stats display */}
      {!isLoading && !sessionsError && filteredSegments.length > 0 && (
        <div className="bg-white">
          <StatsStats
            stats={stats}
            showAllApps={showAllApps}
            onToggleShowAll={() => setShowAllApps(!showAllApps)}
            viewMode={viewMode}
            onToggleViewMode={() => setViewMode((prev) => (prev === "list" ? "treemap" : "list"))}
            timeWindowSelector={timeWindowSelector}
            timeWindow={timeWindow}
          />
        </div>
      )}
    </div>
  );
}

interface StatsSkeletonProps {
  timeWindowSelector: ReactNode;
  viewMode: "list" | "treemap";
  onToggleViewMode: () => void;
  showAllApps: boolean;
  onToggleShowAll: () => void;
}

const SkeletonBar = ({ className = "" }: { className?: string }) => (
  <div className={`skeleton-bar bg-gray-200 rounded ${className}`} />
);

function StatsSkeleton({
  timeWindowSelector,
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
            <div className="text-sm font-normal tracking-wide text-gray-800">
              Total Duration
            </div>
            <SkeletonBar className="h-8 w-32" />
          </div>
          <div className="flex gap-2 pt-0.5">
            {timeWindowSelector}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-normal tracking-wide text-gray-800">
                Top Applications
              </h3>
              <button
                onClick={onToggleShowAll}
                className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors"
              >
                {showAllApps ? "Hide" : "Show All"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onToggleViewMode} className="flex items-center gap-1">
                <KeyBox selected={viewMode === "list"} hovered={false}>L</KeyBox>
                <span className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors">
                  List
                </span>
              </button>
              <button onClick={onToggleViewMode} className="flex items-center gap-1">
                <KeyBox selected={viewMode === "treemap"} hovered={false}>T</KeyBox>
                <span className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors">
                  Treemap
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

