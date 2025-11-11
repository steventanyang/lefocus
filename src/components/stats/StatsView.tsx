import { useState, useEffect, useMemo } from "react";
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

  // Fetch all sessions
  const { data: sessions = [], isLoading: sessionsLoading, error: sessionsError } = useSessionsList();

  // Fetch all segments for all sessions
  const { segmentsBySession, isLoading: segmentsLoading } = useSegmentsForSessions(sessions);

  // Handle keyboard shortcuts for time window selection (d/w/m)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      // Only handle d/w/m when no modifier keys are pressed
      const isModifierPressed = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
      if (isModifierPressed) {
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

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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

  const buttonPrimaryClass =
    "bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white";

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">Stats</h1>
        <button
          className="text-base font-light hover:opacity-70 transition-opacity flex items-center gap-2"
          onClick={() => onNavigate("timer")}
        >
          <KeyboardShortcut keyLetter="t" />
          <span>View Timer</span>
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-base font-light text-center p-8">
          Loading stats...
        </div>
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
            segments={filteredSegments}
            onSegmentClick={() => {}} // No-op for now, could navigate to segment details later
            showAllApps={showAllApps}
            onToggleShowAll={() => setShowAllApps(!showAllApps)}
            timeWindowSelector={
              <div className="flex gap-2">
                <button
                  onClick={() => setTimeWindow("day")}
                  className="text-base font-light flex items-center gap-2 flex-1 justify-center"
                >
                  <KeyBox selected={timeWindow === "day"}>D</KeyBox>
                  <span>Day</span>
                </button>
                <button
                  onClick={() => setTimeWindow("week")}
                  className="text-base font-light flex items-center gap-2 flex-1 justify-center"
                >
                  <KeyBox selected={timeWindow === "week"}>W</KeyBox>
                  <span>Week</span>
                </button>
                <button
                  onClick={() => setTimeWindow("month")}
                  className="text-base font-light flex items-center gap-2 flex-1 justify-center"
                >
                  <KeyBox selected={timeWindow === "month"}>M</KeyBox>
                  <span>Month</span>
                </button>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}

