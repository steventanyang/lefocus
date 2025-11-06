import { SessionSummary } from "@/types/timer";
import { Segment } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";

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
    return `Today • ${timeString}`;
  }
  
  const dateString = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  
  return `${dateString} • ${timeString}`;
}

function getStatusBadge(status: string): { text: string; className: string } {
  switch (status) {
    case "completed":
      return {
        text: "Completed",
        className: "bg-green-100 text-green-800 border-green-800",
      };
    case "interrupted":
      return {
        text: "Interrupted",
        className: "bg-amber-100 text-amber-800 border-amber-800",
      };
    default:
      return {
        text: status,
        className: "bg-gray-100 text-gray-800 border-gray-800",
      };
  }
}

export function SessionCard({ session, segments, onClick }: SessionCardProps) {
  const totalDurationSecs = Math.floor(session.activeMs / 1000);
  const statusBadge = getStatusBadge(session.status);

  return (
    <button
      onClick={() => onClick(session)}
      className="w-full border border-black p-4 flex flex-col gap-4 hover:bg-gray-50 cursor-pointer transition-colors text-left relative"
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
        <div className="flex h-8 w-full border border-black overflow-hidden bg-white">
          {(() => {
            const totalDuration = segments.reduce(
              (sum, seg) => sum + seg.durationSecs,
              0
            );
            if (totalDuration === 0) return null;
            
            return segments.map((segment, index) => {
              const backgroundColor = getAppColor(
                segment.bundleId,
                segment.confidence
              );
              return (
                <div
                  key={segment.id}
                  className="flex-shrink-0"
                  style={{
                    flexGrow: segment.durationSecs,
                    flexBasis: 0,
                    backgroundColor,
                    borderRight: index < segments.length - 1 ? "1px solid black" : "none",
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
        <div className="flex h-8 w-full border border-black overflow-hidden bg-white">
          {session.topApps.map((app, index) => {
            const backgroundColor = getAppColor(app.bundleId);
            return (
              <div
                key={app.bundleId}
                className="flex-shrink-0"
                style={{
                  flexGrow: app.durationSecs,
                  flexBasis: 0,
                  backgroundColor,
                  borderRight: index < session.topApps.length - 1 ? "1px solid black" : "none",
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
          {session.topApps.map((app) => (
            <div key={app.bundleId} className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div
                  className="w-3 h-3 border border-black flex-shrink-0"
                  style={{ backgroundColor: getAppColor(app.bundleId) }}
                />
                <span className="text-sm font-normal truncate">
                  {app.appName || app.bundleId}
                </span>
              </div>
              <span className="text-sm font-light tabular-nums flex-shrink-0 whitespace-nowrap">
                {formatDuration(app.durationSecs)} ({app.percentage.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm font-light text-gray-500 text-center py-4">
          No apps tracked
        </div>
      )}
    </button>
  );
}
