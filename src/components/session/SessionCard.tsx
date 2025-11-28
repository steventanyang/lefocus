import { forwardRef } from "react";
import { SessionSummary } from "@/types/timer";
import { Segment } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";
import { LabelTag } from "@/components/labels/LabelTag";
import { KeyBox } from "@/components/ui/KeyBox";
import type { Label } from "@/types/label";

interface SessionCardProps {
  session: SessionSummary;
  segments?: Segment[];
  labels?: Label[];
  onClick: (session: SessionSummary) => void;
  isSelected?: boolean;
  isDeleteConfirm?: boolean;
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

function getStatusBadge(status: string): { text: string; className: string } {
  switch (status) {
    case "completed":
      return {
        text: "Completed",
        className: "bg-green-100 text-green-800 border-green-500",
      };
    case "interrupted":
      return {
        text: "Interrupted",
        className: "bg-amber-100 text-amber-800 border-amber-300",
      };
    default:
      return {
        text: status,
        className: "bg-gray-100 text-gray-800 border-gray-300",
      };
  }
}

export const SessionCard = forwardRef<HTMLButtonElement, SessionCardProps>(
  ({ session, segments, labels = [], onClick, isSelected = false, isDeleteConfirm = false }, ref) => {
    const totalDurationSecs = Math.floor(session.activeMs / 1000);
    const statusBadge = getStatusBadge(session.status);
    
    // Find the label for this session
    const currentLabel = session.labelId ? labels.find(l => l.id === session.labelId) : null;

    return (
      <button
        ref={ref}
        onClick={() => onClick(session)}
        className={`w-full border p-4 flex flex-col gap-4 hover:bg-gray-50 cursor-pointer transition-colors text-left relative min-h-[200px] ${
          isSelected ? "bg-gray-100 border-gray-500" : "border-gray-300"
        }`}
      >
      {/* Duration on top left */}
      <span className="text-2xl font-semibold tabular-nums">
        {formatDuration(totalDurationSecs)}
      </span>
      
      {/* Status badge in top right corner */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {/* Label tag on the left of status badge */}
        {currentLabel ? (
          <LabelTag label={currentLabel} size="small" selected={true} />
        ) : (
          <LabelTag label={null} size="small" selected={false} showEmptyFrame={false} />
        )}
        
        <span
          className={`text-xs px-2 py-1 border ${statusBadge.className} font-normal`}
        >
          {statusBadge.text}
        </span>
      </div>
      
      {/* Date in bottom right corner */}
      <span className="absolute bottom-4 right-4 text-sm font-light">
        {formatDateTime(session.startedAt)}
      </span>

      {/* Mini timeline bar */}
      {segments && Array.isArray(segments) && segments.length > 0 ? (
        <div className="flex h-8 w-full overflow-hidden">
          {(() => {
            const totalDuration = segments.reduce(
              (sum, seg) => sum + seg.durationSecs,
              0
            );
            if (totalDuration === 0) return null;
            
            return segments.map((segment) => {
              const backgroundColor = getAppColor(segment.bundleId, {
                iconColor: segment.iconColor,
                confidence: segment.confidence,
              });
              return (
                <div
                  key={segment.id}
                  className="flex-shrink-0"
                  style={{
                    flexGrow: segment.durationSecs,
                    flexBasis: 0,
                    backgroundColor,
                  }}
                  title={`${segment.appName || segment.bundleId} - ${formatDuration(
                    segment.durationSecs
                  )}`}
                />
              );
            });
          })()}
        </div>
      ) : session.topApps && session.topApps.length > 0 ? (
        <div className="flex h-8 w-full overflow-hidden">
          {session.topApps.map((app) => {
            const iconColor = session.appColors[app.bundleId];
            const backgroundColor = getAppColor(app.bundleId, { iconColor });
            return (
              <div
                key={app.bundleId}
                className="flex-shrink-0"
                style={{
                  flexGrow: app.durationSecs,
                  flexBasis: 0,
                  backgroundColor,
                }}
                title={`${app.appName || app.bundleId} - ${formatDuration(
                  app.durationSecs
                )} (${app.percentage.toFixed(0)}%)`}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex h-8 w-full">
          <div className="flex-1 bg-transparent border border-gray-200"></div>
        </div>
      )}

      {/* Top apps list or Delete Confirmation - Absolute positioned bottom-left */}
      <div className="absolute bottom-4 left-4">
        {isDeleteConfirm ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-light tracking-wide text-gray-600">
              delete session?
            </span>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <KeyBox>⌘</KeyBox>
                <KeyBox>D</KeyBox>
              </div>
              <span className="text-sm font-light text-gray-600">to confirm</span>
            </div>
          </div>
        ) : session.topApps.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-light tracking-wide">
              top apps
            </span>
            <div className="flex items-center gap-3">
              {session.topApps.slice(0, 3).map((app) => {
                const iconDataUrl = session.appIcons[app.bundleId];
                const iconColor = session.appColors[app.bundleId];
                return (
                  <div key={app.bundleId} className="flex items-center gap-2">
                    {shouldShowAppleLogo(app.bundleId, app.appName) ? (
                      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-gray-800">
                        <AppleLogo className="w-5 h-5" />
                      </div>
                    ) : iconDataUrl ? (
                      <img
                        src={iconDataUrl}
                        alt={app.appName || app.bundleId}
                        className="w-6 h-6 flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-6 h-6 border border-black flex-shrink-0"
                        style={{ backgroundColor: getAppColor(app.bundleId, { iconColor }) }}
                      />
                    )}
                    <span className="text-sm font-normal whitespace-nowrap">
                      {app.appName || app.bundleId}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-sm font-light text-gray-500">
            No apps tracked
          </div>
        )}
      </div>
      </button>
    );
  }
);

SessionCard.displayName = "SessionCard";
