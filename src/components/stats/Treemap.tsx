import { useRef, useEffect, useState } from "react";
import { AppDuration } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";

interface TreemapProps {
  apps: AppDuration[];
  onAppClick: (bundleId: string) => void;
  selectedBundleId: string | null;
}

interface TreemapRect {
  app: AppDuration;
  x: number;
  y: number;
  width: number;
  height: number;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours === 0 && mins === 0) return `${secs}s`;
  if (hours === 0 && secs === 0) return `${mins}m`;
  if (hours === 0) return `${mins}m ${secs}s`;
  if (mins === 0 && secs === 0) return `${hours}h`;
  if (mins === 0) return `${hours}h ${secs}s`;
  if (secs === 0) return `${hours}h ${mins}m`;
  return `${hours}h ${mins}m ${secs}s`;
}

// Binary space partitioning treemap algorithm (more fractal/nested appearance)
function calculateTreemapLayout(
  apps: AppDuration[],
  containerWidth: number,
  containerHeight: number
): TreemapRect[] {
  if (apps.length === 0) return [];

  const MIN_PERCENTAGE = 1; // Minimum 1% - don't show apps below this

  // Filter out apps below 1%
  const appsAboveMin = apps.filter(app => app.percentage >= MIN_PERCENTAGE);

  if (appsAboveMin.length === 0) return [];

  // Calculate total percentage of visible apps
  const totalPercentage = appsAboveMin.reduce((sum, app) => sum + app.percentage, 0);

  // Normalize percentages to sum to 100% (redistribute space from filtered apps)
  const normalizedApps = appsAboveMin.map(app => ({
    ...app,
    percentage: (app.percentage / totalPercentage) * 100,
  }));

  // Sort apps by percentage descending
  const sortedApps = normalizedApps.sort((a, b) => b.percentage - a.percentage);

  return sliceAndDice(sortedApps, 0, 0, containerWidth, containerHeight, true);
}

// Recursive slice-and-dice algorithm with alternating orientation
function sliceAndDice(
  apps: AppDuration[],
  x: number,
  y: number,
  width: number,
  height: number,
  horizontal: boolean
): TreemapRect[] {
  if (apps.length === 0) return [];

  // Base case: single app
  if (apps.length === 1) {
    return [{
      app: apps[0],
      x,
      y,
      width,
      height,
    }];
  }

  // Calculate total percentage
  const totalPercentage = apps.reduce((sum, app) => sum + app.percentage, 0);

  // Find split point that divides the area roughly in half by percentage
  let splitIndex = 1;
  let leftPercentage = apps[0].percentage;

  // Find the split that gets closest to 50/50 by percentage
  for (let i = 1; i < apps.length - 1; i++) {
    const currentLeftPercent = (leftPercentage / totalPercentage) * 100;
    const nextLeftPercent = ((leftPercentage + apps[i].percentage) / totalPercentage) * 100;

    // Check if adding next item gets us closer to 50%
    if (Math.abs(nextLeftPercent - 50) < Math.abs(currentLeftPercent - 50)) {
      leftPercentage += apps[i].percentage;
      splitIndex = i + 1;
    } else {
      break;
    }
  }

  const leftApps = apps.slice(0, splitIndex);
  const rightApps = apps.slice(splitIndex);

  const leftRatio = leftPercentage / totalPercentage;
  const rightRatio = 1 - leftRatio;

  let leftRects: TreemapRect[];
  let rightRects: TreemapRect[];

  if (horizontal) {
    // Split horizontally (left/right)
    const leftWidth = width * leftRatio;
    const rightWidth = width * rightRatio;

    leftRects = sliceAndDice(leftApps, x, y, leftWidth, height, !horizontal);
    rightRects = sliceAndDice(rightApps, x + leftWidth, y, rightWidth, height, !horizontal);
  } else {
    // Split vertically (top/bottom)
    const topHeight = height * leftRatio;
    const bottomHeight = height * rightRatio;

    leftRects = sliceAndDice(leftApps, x, y, width, topHeight, !horizontal);
    rightRects = sliceAndDice(rightApps, x, y + topHeight, width, bottomHeight, !horizontal);
  }

  return [...leftRects, ...rightRects];
}

// Determine if text color should be lighter or darker version of the background color
function getTextColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (luminance > 0.5) {
    // Light background - make text darker
    return `rgb(${Math.max(0, r - 100)}, ${Math.max(0, g - 100)}, ${Math.max(0, b - 100)})`;
  } else {
    // Dark background - make text lighter
    return `rgb(${Math.min(255, r + 100)}, ${Math.min(255, g + 100)}, ${Math.min(255, b + 100)})`;
  }
}

export function Treemap({ apps, onAppClick, selectedBundleId }: TreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 500 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        // Set height to use more vertical space
        const height = Math.min(500, window.innerHeight * 0.5);
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const rects = calculateTreemapLayout(apps, dimensions.width, dimensions.height);

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-white"
      style={{ height: `${dimensions.height}px` }}
    >
      {rects.map((rect) => {
        const { app, x, y, width, height } = rect;
        const appColor = getAppColor(app.bundleId, { iconColor: app.iconColor });
        const textColor = getTextColor(appColor);
        const isSelected = selectedBundleId === app.bundleId;

        // Add gap between boxes (2px on each side = 4px total gap)
        const GAP = 2;
        const adjustedX = x + GAP;
        const adjustedY = y + GAP;
        const adjustedWidth = width - GAP * 2;
        const adjustedHeight = height - GAP * 2;

        // Determine what to show based on block size
        const LOGO_SIZE = 32; // w-8 h-8 = 32px
        const showLogo = adjustedWidth >= LOGO_SIZE && adjustedHeight >= LOGO_SIZE;
        const showName = adjustedWidth >= 80 && adjustedHeight >= 40;
        const showPercentage = adjustedWidth >= 60 && adjustedHeight >= 40;
        const showDuration = adjustedWidth >= 100 && adjustedHeight >= 60;
        const showAllLabels = adjustedWidth >= 120 && adjustedHeight >= 120;

        return (
          <button
            key={app.bundleId}
            onClick={() => onAppClick(app.bundleId)}
            className="absolute transition-all duration-200 hover:opacity-90"
            style={{
              left: `${adjustedX}px`,
              top: `${adjustedY}px`,
              width: `${adjustedWidth}px`,
              height: `${adjustedHeight}px`,
              backgroundColor: appColor,
              opacity: isSelected ? 0.85 : 1,
              boxShadow: isSelected ? '0 0 0 3px rgba(0,0,0,0.2) inset' : 'none',
            }}
          >
            {/* App Icon - Only show if block is large enough */}
            {showLogo && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ color: textColor }}>
                {shouldShowAppleLogo(app.bundleId, app.appName) ? (
                  <AppleLogo className="w-6 h-6" />
                ) : app.iconDataUrl ? (
                  <img
                    src={app.iconDataUrl}
                    alt={app.appName || app.bundleId}
                    className="w-8 h-8"
                  />
                ) : null}
              </div>
            )}

            {/* Text labels - positioned absolutely */}
            {showAllLabels && (
              <>
                {/* Name - top left */}
                <div
                  className="absolute top-2 left-2 text-xs font-medium truncate max-w-[calc(100%-3rem)] pointer-events-none"
                  style={{ color: textColor }}
                >
                  {app.appName || app.bundleId}
                </div>

                {/* Percentage - top right */}
                <div
                  className="absolute top-2 right-2 text-base font-bold pointer-events-none"
                  style={{ color: textColor }}
                >
                  {app.percentage.toFixed(0)}%
                </div>

                {/* Duration - bottom right */}
                <div
                  className="absolute bottom-2 right-2 text-xs font-medium pointer-events-none"
                  style={{ color: textColor }}
                >
                  {formatDuration(app.durationSecs)}
                </div>
              </>
            )}

            {/* Medium size: show name or percentage */}
            {!showAllLabels && showName && (
              <div
                className="absolute top-2 left-2 text-xs font-medium truncate max-w-[calc(100%-1rem)] pointer-events-none"
                style={{ color: textColor }}
              >
                {app.appName || app.bundleId}
              </div>
            )}

            {!showAllLabels && showPercentage && !showName && (
              <div
                className="absolute top-2 right-2 text-sm font-bold pointer-events-none"
                style={{ color: textColor }}
              >
                {app.percentage.toFixed(0)}%
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
