import { useState, useEffect, useRef } from "react";
import { SegmentStats as Stats, Segment } from "@/types/segment";
import { getAppColor, getConfidenceLabel } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";
import { useSessionResultsKeyboard } from "@/hooks/useSessionResultsKeyboard";

interface SegmentStatsProps {
  stats: Stats;
  segments: Segment[];
  onSegmentClick: (segment: Segment) => void;
  backButton?: React.ReactNode;
  labelSection?: {
    labelKey: React.ReactNode;
    labelTag: React.ReactNode;
  };
  dateTime?: string; // ISO 8601 datetime string
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const timeString = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  
  if (isToday) {
    return `Today ${timeString}`;
  }
  
  const dateString = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  
  return `${dateString} ${timeString}`;
}

// Convert hex color to rgba with opacity for light background
function hexToRgba(hex: string, opacity: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  // Handle both 3-digit and 6-digit hex
  const r = parseInt(cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function SegmentStats({
  stats,
  segments,
  onSegmentClick,
  backButton,
  labelSection,
  dateTime,
}: SegmentStatsProps) {
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [timelineSelectedIndex, setTimelineSelectedIndex] = useState<number | null>(0); // Start on timeline
  const [listHoverIndex, setListHoverIndex] = useState<number | null>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Filter segments based on selected app
  const filteredSegments = selectedBundleId
    ? segments.filter((seg) => seg.bundleId === selectedBundleId)
    : segments;

  // Recalculate total duration from filtered segments
  const totalDuration = filteredSegments.reduce(
    (sum, seg) => sum + seg.durationSecs,
    0
  );

  // Derive valid timeline index during render (not in effect)
  // This ensures the index is always valid without using effects to adjust state
  // When listHoverIndex is set, we're on the list, so timeline should not show selection
  const validTimelineSelectedIndex = (() => {
    if (filteredSegments.length === 0) return null;
    // If we're on the list (listHoverIndex is not null), don't show timeline selection
    if (listHoverIndex !== null) return null;
    if (timelineSelectedIndex === null) return 0; // Initialize to first segment
    if (timelineSelectedIndex >= filteredSegments.length) return 0; // Reset if out of bounds
    return timelineSelectedIndex;
  })();

  // Calculate pill position based on actual rendered segment positions
  // This is a valid use of useEffect: synchronizing with DOM (external system)
  const [pillPosition, setPillPosition] = useState<{
    left: number;
    width: number;
    color: string;
  } | null>(null);

  // Update pill position when selection or segments change
  // This is a valid use of useEffect: synchronizing with DOM (external system)
  useEffect(() => {
    if (validTimelineSelectedIndex === null || filteredSegments.length === 0 || !timelineContainerRef.current) {
      setPillPosition(null);
      return;
    }

    const selectedSegment = filteredSegments[validTimelineSelectedIndex];
    if (!selectedSegment) {
      setPillPosition(null);
      return;
    }

    // Use requestAnimationFrame to ensure DOM has fully rendered
    requestAnimationFrame(() => {
      const container = timelineContainerRef.current;
      const selectedButton = segmentRefs.current[validTimelineSelectedIndex];
      
      if (!container || !selectedButton) {
        setPillPosition(null);
        return;
      }

      // Get actual rendered positions
      const containerRect = container.getBoundingClientRect();
      const buttonRect = selectedButton.getBoundingClientRect();
      
      // Calculate position relative to container
      const left = ((buttonRect.left - containerRect.left) / containerRect.width) * 100;
      const width = (buttonRect.width / containerRect.width) * 100;

      // Get color of selected segment
      const selectedColor = getAppColor(selectedSegment.bundleId, {
        iconColor: selectedSegment.iconColor,
        confidence: selectedSegment.confidence,
      });

      setPillPosition({
        left,
        width,
        color: selectedColor,
      });
    });
  }, [filteredSegments, validTimelineSelectedIndex]);

  // Toggle selection handler
  const handleAppClick = (bundleId: string) => {
    setSelectedBundleId((prev) => (prev === bundleId ? null : bundleId));
  };

  // Handle Enter key to toggle list selection
  const handleListToggle = (bundleId: string) => {
    handleAppClick(bundleId);
  };

  // Ensure timeline index is properly initialized when segments load
  useEffect(() => {
    if (filteredSegments.length > 0) {
      // If we're not on the list and timeline index is null or out of bounds, reset to 0
      if (listHoverIndex === null && (timelineSelectedIndex === null || timelineSelectedIndex >= filteredSegments.length)) {
        setTimelineSelectedIndex(0);
      }
    } else {
      // If segments are empty, reset to null
      if (timelineSelectedIndex !== null) {
        setTimelineSelectedIndex(null);
      }
    }
  }, [filteredSegments.length, listHoverIndex, timelineSelectedIndex]);

  // Keyboard navigation
  // Pass raw timelineSelectedIndex so hook can detect when we're on list vs timeline
  // The hook needs to know the actual state, not the derived valid index
  useSessionResultsKeyboard({
    segments: filteredSegments,
    topApps: stats.topApps,
    timelineSelectedIndex: timelineSelectedIndex, // Use raw state, not derived
    listHoverIndex,
    selectedBundleId,
    onSetTimelineSelectedIndex: setTimelineSelectedIndex,
    onSetListHoverIndex: setListHoverIndex,
    onTimelineClick: onSegmentClick,
    onListToggle: handleListToggle,
  });

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between pb-2">
        <div className="text-base font-light tracking-wide">
          {dateTime ? formatDateTime(dateTime) : "Session Summary"}
        </div>
        {backButton && <div>{backButton}</div>}
      </div>

      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-normal tracking-wide text-gray-800">
            Total Duration
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatDuration(stats.totalDurationSecs)}
          </div>
        </div>

        {labelSection && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {labelSection.labelKey}
              <div className="text-sm font-normal tracking-wide text-gray-800">
                Label
              </div>
            </div>
            <div>{labelSection.labelTag}</div>
          </div>
        )}
      </div>

      {/* Timeline embedded here */}
      {filteredSegments.length > 0 ? (
        <div className="relative">
          {/* Dynamic pill indicator */}
          {pillPosition && (
            <div
              className="absolute h-1 rounded-full transition-all duration-300 ease-in-out z-10"
              style={{
                left: `${pillPosition.left}%`,
                width: `${pillPosition.width}%`,
                backgroundColor: pillPosition.color,
                top: '-8px',
              }}
            />
          )}
          <div 
            ref={timelineContainerRef}
            className="flex h-[60px] gap-[3px] overflow-hidden"
          >
          {filteredSegments.map((segment, index) => {
            const widthPercent = totalDuration > 0 
              ? (segment.durationSecs / totalDuration) * 100 
              : 0;
            const backgroundColor = getAppColor(segment.bundleId, {
              iconColor: segment.iconColor,
              confidence: segment.confidence,
            });
            const isSelected = validTimelineSelectedIndex === index;
            return (
              <button
                key={segment.id}
                ref={(el) => {
                  segmentRefs.current[index] = el;
                }}
                className={`p-0 cursor-pointer ${
                  isSelected ? "opacity-80" : "hover:opacity-70 transition-opacity duration-200"
                }`}
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor,
                }}
                onClick={() => onSegmentClick(segment)}
                title={`${segment.appName || segment.bundleId} - ${formatDuration(
                  segment.durationSecs
                )} (${getConfidenceLabel(segment.confidence)})`}
              />
            );
          })}
          </div>
        </div>
      ) : selectedBundleId ? (
        <div className="flex h-[60px] items-center justify-center text-sm text-gray-500">
          No segments found for selected app
        </div>
      ) : null}

      {stats.topApps.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-normal tracking-wide text-gray-800">
            Top Applications
          </h3>
          {stats.topApps.map((app, index) => {
            const isSelected = selectedBundleId === app.bundleId;
            const isHovered = listHoverIndex === index;
            const appColor = getAppColor(app.bundleId, { iconColor: app.iconColor });
            const lightBgColor = isSelected ? hexToRgba(appColor, 0.22) : undefined;
            const hoverBgColor = isHovered && !isSelected ? hexToRgba(appColor, 0.08) : undefined;
            return (
              <button
                key={app.bundleId}
                onClick={() => handleAppClick(app.bundleId)}
                className="flex items-center gap-3 w-full text-left transition-all duration-200 p-2 -m-2"
                style={isSelected ? { backgroundColor: lightBgColor } : isHovered ? { backgroundColor: hoverBgColor } : undefined}
                onMouseEnter={() => setListHoverIndex(index)}
              >
                {/* Icon on left */}
                {shouldShowAppleLogo(app.bundleId, app.appName) ? (
                  <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-gray-800">
                    <AppleLogo className="w-6 h-6" />
                  </div>
                ) : app.iconDataUrl ? (
                  <img
                    src={app.iconDataUrl}
                    alt={app.appName || app.bundleId}
                    className="w-8 h-8 flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-8 h-8 border border-black flex-shrink-0"
                    style={{ backgroundColor: getAppColor(app.bundleId, { iconColor: app.iconColor }) }}
                  />
                )}

                {/* Name and bar stacked vertically on right - aligned top to bottom with icon */}
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  {/* Top row: Name on left, duration above end of bar */}
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-normal flex-1">
                      {app.appName || app.bundleId}
                    </span>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-gray-600">
                      {formatDuration(app.durationSecs)}
                    </span>
                  </div>
                  {/* Bottom row: Progress bar taking full width, percentage overlaid on right */}
                  <div className="flex items-end gap-2">
                    <div className={`flex-1 h-2 transition-all duration-300 ${isSelected ? 'bg-white' : 'bg-gray-200'}`}>
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${app.percentage}%`,
                          backgroundColor: getAppColor(app.bundleId, { iconColor: app.iconColor }),
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* Percentage spans full height on the right */}
                <span className="text-2xl font-semibold tabular-nums w-16 text-right leading-none">
                  {app.percentage.toFixed(0)}%
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
