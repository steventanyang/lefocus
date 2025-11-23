import { forwardRef } from "react";
import { SessionSummary } from "@/types/timer";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils"; // Updated to .tsx
import { LabelTag } from "@/components/labels/LabelTag";
import type { Label } from "@/types/label";

interface BlockSessionCardProps {
  session: SessionSummary;
  labels?: Label[];
  onClick: (session: SessionSummary) => void;
  isSelected?: boolean;
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
  const timeString = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return timeString;
}

function getStatusBadge(status: string): { icon: React.ReactNode; className: string; wrapperClassName: string } {
  switch (status) {
    case "completed":
      return {
        icon: (
          <svg width="10" height="8" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
          </svg>
        ),
        wrapperClassName: "bg-green-100 text-green-800 border-green-500",
        className: "",
      };
    case "interrupted":
      return {
        icon: "✕",
        wrapperClassName: "bg-amber-100 text-amber-800 border-amber-300",
        className: "",
      };
    default:
      return {
        icon: "",
        wrapperClassName: "bg-gray-100 text-gray-800 border-gray-300",
        className: "",
      };
  }
}

export const BlockSessionCard = forwardRef<HTMLButtonElement, BlockSessionCardProps>(
  ({ session, labels = [], onClick, isSelected = false }, ref) => {
    const totalDurationSecs = Math.floor(session.activeMs / 1000);
    const statusBadge = getStatusBadge(session.status);
    const topApp = session.topApps.length > 0 ? session.topApps[0] : null;
    const iconDataUrl = topApp ? session.appIcons[topApp.bundleId] : null;
    const iconColor = topApp ? session.appColors[topApp.bundleId] : null;
    
    // Find the label for this session
    const currentLabel = session.labelId ? labels.find(l => l.id === session.labelId) : null;

    return (
      <button
        ref={ref}
        onClick={() => onClick(session)}
        className={`w-full aspect-[3/1.2] border p-3 py-4 hover:bg-gray-50 cursor-pointer transition-colors text-left relative ${
          isSelected ? "bg-gray-100 border-gray-500" : "border-gray-300"
        }`}
      >
      {/* Top-left: Duration */}
      <div className="absolute top-3 left-3">
        <span className="text-lg font-semibold tabular-nums">
          {formatDuration(totalDurationSecs)}
        </span>
      </div>

      {/* Top-right: Status indicator with label */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {/* Label tag on the left of status */}
        {currentLabel ? (
          <LabelTag label={currentLabel} size="small" selected={true} maxWidth="80px" />
        ) : (
          <LabelTag
            label={null}
            size="small"
            selected={false}
            maxWidth="80px"
            showEmptyFrame={false}
          />
        )}
        
        {/* Square status indicator */}
        <div
          className={`w-6 h-6 border ${statusBadge.wrapperClassName} flex items-center justify-center text-xs font-bold`}
        >
          {statusBadge.icon}
        </div>
      </div>

      {/* Bottom-left: Top app */}
      {topApp && (
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 max-w-[70%]">
          {shouldShowAppleLogo(topApp.bundleId, topApp.appName) ? (
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-gray-800">
              <AppleLogo className="w-4 h-4" />
            </div>
          ) : iconDataUrl ? (
            <img
              src={iconDataUrl}
              alt={topApp.appName || topApp.bundleId}
              className="w-5 h-5 flex-shrink-0"
            />
          ) : (
            <div
              className="w-5 h-5 border border-black flex-shrink-0 rounded"
              style={{ backgroundColor: getAppColor(topApp.bundleId, { iconColor }) }}
            />
          )}
          <span className="text-xs font-normal truncate min-w-0">
            {topApp.appName || topApp.bundleId}
          </span>
        </div>
      )}

      {/* Bottom-right: Date/time */}
      <div className="absolute bottom-3 right-3">
        <span className="text-xs font-light">
          {formatDateTime(session.startedAt)}
        </span>
      </div>
      </button>
    );
  }
);

BlockSessionCard.displayName = "BlockSessionCard";

