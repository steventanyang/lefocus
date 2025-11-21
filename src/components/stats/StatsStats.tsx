import { useState, useMemo } from "react";
import { SegmentStats as Stats, AppDuration } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";
import { KeyBox } from "@/components/ui/KeyBox";
import { Treemap } from "./Treemap";
import { useListNavigation } from "@/hooks/useListNavigation";
import { AppDetailsModal } from "./AppDetailsModal";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";
import { useSelectionState } from "@/hooks/useSelectionState";
import { formatDuration, hexToRgba } from "@/utils/formatUtils";
import { getDateRangeForWindow, TimeWindow, formatDateRange } from "@/utils/dateUtils";

interface StatsStatsProps {
  stats: Stats;
  showAllApps: boolean;
  onToggleShowAll: () => void;
  viewMode: "list" | "treemap";
  onToggleViewMode: () => void;
  labelFilterSelector?: React.ReactNode;
  timeWindow: TimeWindow;
  customDateRange?: { start: Date; end: Date } | null;
}

export function StatsStats({
  stats,
  showAllApps,
  onToggleShowAll,
  viewMode,
  onToggleViewMode,
  labelFilterSelector,
  timeWindow,
  customDateRange,
}: StatsStatsProps) {
  const [activeApp, setActiveApp] = useState<AppDuration | null>(null);
  
  // Calculate date range for display
  const dateRangeText = useMemo(() => {
    if (timeWindow === "custom" && customDateRange) {
      const start = customDateRange.start;
      const end = customDateRange.end;
      
      
      
      const formatDateNoYear = (date: Date) => {
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const day = date.getDate();
        const dayWithSuffix = day + (day === 1 || day === 21 || day === 31 ? 'st' : 
                                      day === 2 || day === 22 ? 'nd' : 
                                      day === 3 || day === 23 ? 'rd' : 'th');
        return `${month} ${dayWithSuffix}`;
      };
      
      const startFormatted = formatDateNoYear(start);
      const endFormatted = (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) 
        ? formatDateNoYear(end)
        : formatDateNoYear(end);
      
      return `${startFormatted} - ${endFormatted}`;
    }
    return formatDateRange(timeWindow);
  }, [timeWindow, customDateRange]);
  
  // Calculate date range for fetching app details
  const { start: startTime, end: endTime } = useMemo(() => {
    if (timeWindow === "custom" && customDateRange) {
      return customDateRange;
    }
    return getDateRangeForWindow(timeWindow);
  }, [timeWindow, customDateRange]);

  // Find the scrollable parent container (similar to ActivitiesView)
  const getScrollContainer = useMemo(() => (): HTMLElement | null => {
    let element: HTMLElement | null = document.body;
    while (element) {
      const style = window.getComputedStyle(element);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        return element;
      }
      element = element.parentElement;
    }
    return document.body;
  }, []);

  // Use custom hook for selection state management
  const selection = useSelectionState({
    items: stats.topApps,
    getItemKey: (app) => app.bundleId,
    initialSelectedIndex: 0, // Default to first item for Enter key
  });

  // Use custom hook for scroll behavior
  const { scrollRefs: cardRefs, scrollToItem } = useScrollIntoView<HTMLButtonElement>({
    enabled: viewMode === "list" && !activeApp,
    getScrollContainer,
  });

  // Handle selection (action/modal)
  const handleSelect = (app: AppDuration) => {
    setActiveApp(app);
    selection.handleFocus(app.bundleId); // Ensure it's focused too
  };

  useListNavigation({
    items: stats.topApps,
    selectedIndex: selection.focusedIndex,
    onSelectIndex: (index) => {
      selection.selectByIndex(index);
      if (index !== null) scrollToItem(index);
    },
    onConfirm: (app) => handleSelect(app),
    isActive: viewMode === "list" && !activeApp, // Disable list nav when modal is open
  });

  return (
    <div className="p-6 flex flex-col gap-6">
      {activeApp && (
        <AppDetailsModal
          app={activeApp}
          startTime={startTime.toISOString()}
          endTime={endTime.toISOString()}
          onClose={() => setActiveApp(null)}
        />
      )}

      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-normal tracking-wide text-gray-800">
            {dateRangeText}
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatDuration(stats.totalDurationSecs)}
          </div>
        </div>
        {labelFilterSelector && (
          <div className="flex gap-2 pt-0.5">
            {labelFilterSelector}
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-normal tracking-wide text-gray-800">
              Top Applications
            </h3>
            <button
              onClick={onToggleShowAll}
              className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-1"
            >
              <KeyBox selected={showAllApps} hovered={false}>{showAllApps ? "V" : "V"}</KeyBox>
              {showAllApps ? "View Top Apps" : "View All"}
            </button>
          </div>

          {/* View mode toggles on the right */}
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleViewMode}
              className="flex items-center gap-1"
            >
              <KeyBox selected={viewMode === "list"} hovered={false}>L</KeyBox>
              <span className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors">
                List
              </span>
            </button>
            <button
              onClick={onToggleViewMode}
              className="flex items-center gap-1"
            >
              <KeyBox selected={viewMode === "treemap"} hovered={false}>T</KeyBox>
              <span className="text-sm font-light text-gray-600 hover:text-gray-800 transition-colors">
                Treemap
              </span>
            </button>
          </div>
        </div>

        {/* Add spacing here specifically between header and content */}
        <div className="mt-8">

        {/* Conditional rendering based on viewMode */}
        {viewMode === "treemap" ? (
          <div>
            <Treemap
              apps={stats.topApps}
              focusedBundleId={selection.focusedKey}
              onFocus={selection.handleFocus}
              onSelect={(bundleId) => {
                const app = stats.topApps.find(a => a.bundleId === bundleId);
                if (app) handleSelect(app);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {stats.topApps.map((app) => {
          const appColor = getAppColor(app.bundleId, { iconColor: app.iconColor });
          const lightBgColor = selection.shouldShowFocus(app) ? hexToRgba(appColor, 0.15) : undefined;
          return (
            <button
              key={app.bundleId}
              ref={(el) => {
                cardRefs.current[stats.topApps.findIndex(a => a.bundleId === app.bundleId)] = el;
              }}
              onClick={() => handleSelect(app)}
              onMouseEnter={() => selection.handleHover(app.bundleId)}
              onMouseLeave={selection.handleHoverLeave}
              className={`flex items-center gap-3 w-full text-left transition-all duration-200 rounded p-2 -m-2 ${
                !selection.shouldShowFocus(app) ? "hover:bg-gray-50" : ""
              }`}
              style={selection.shouldShowFocus(app) ? { backgroundColor: lightBgColor } : undefined}
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
                  <div className={`flex-1 h-2 transition-all duration-300 ${selection.shouldShowFocus(app) ? 'bg-white' : 'bg-gray-200'}`}>
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
      </div>
    </div>
  );
}

