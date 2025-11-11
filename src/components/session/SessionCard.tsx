import { SessionSummary } from "@/types/timer";
import { Segment } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";

interface SessionCardProps {
  session: SessionSummary;
  segments?: Segment[];
  onClick: (session: SessionSummary) => void;
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
        className: "bg-green-100 text-green-800 border-green-500 rounded",
      };
    case "interrupted":
      return {
        text: "Interrupted",
        className: "bg-amber-100 text-amber-800 border-amber-300 rounded",
      };
    default:
      return {
        text: status,
        className: "bg-gray-100 text-gray-800 border-gray-300 rounded",
      };
  }
}

export function SessionCard({ session, segments, onClick }: SessionCardProps) {
  const totalDurationSecs = Math.floor(session.activeMs / 1000);
  const statusBadge = getStatusBadge(session.status);

  return (
    <button
      onClick={() => onClick(session)}
      className="w-full border border-gray-300 rounded-lg p-4 flex flex-col gap-4 hover:bg-gray-50 cursor-pointer transition-colors text-left relative"
    >
      {/* Duration on top left */}
      <span className="text-2xl font-semibold tabular-nums">
        {formatDuration(totalDurationSecs)}
      </span>
      
      {/* Status badge in top right corner */}
      <span
        className={`absolute top-4 right-4 text-xs px-2 py-1 border ${statusBadge.className} font-normal`}
      >
        {statusBadge.text}
      </span>
      
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
            
            return segments.map((segment, index) => {
              const backgroundColor = getAppColor(segment.bundleId, {
                iconColor: segment.iconColor,
                confidence: segment.confidence,
              });
              const isFirst = index === 0;
              const isLast = index === segments.length - 1;
              const roundedClass = isFirst && isLast 
                ? "rounded" 
                : isFirst 
                ? "rounded-l" 
                : isLast 
                ? "rounded-r" 
                : "";
              return (
                <div
                  key={segment.id}
                  className={`flex-shrink-0 ${roundedClass}`}
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
          {session.topApps.map((app, index) => {
            const iconColor = session.appColors[app.bundleId];
            const backgroundColor = getAppColor(app.bundleId, { iconColor });
            const isFirst = index === 0;
            const isLast = index === session.topApps.length - 1;
            const roundedClass = isFirst && isLast 
              ? "rounded" 
              : isFirst 
              ? "rounded-l" 
              : isLast 
              ? "rounded-r" 
              : "";
            return (
              <div
                key={app.bundleId}
                className={`flex-shrink-0 ${roundedClass}`}
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
      ) : null}

      {/* Top apps list */}
      {session.topApps.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-light uppercase tracking-wide">
            Top Apps
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
        <div className="text-sm font-light text-gray-500 text-center py-4">
          No apps tracked
        </div>
      )}
    </button>
  );
}
