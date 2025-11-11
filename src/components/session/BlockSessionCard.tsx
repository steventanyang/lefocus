import { SessionSummary } from "@/types/timer";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils"; // Updated to .tsx

interface BlockSessionCardProps {
  session: SessionSummary;
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
  const timeString = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return timeString;
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

export function BlockSessionCard({ session, onClick }: BlockSessionCardProps) {
  const totalDurationSecs = Math.floor(session.activeMs / 1000);
  const statusBadge = getStatusBadge(session.status);
  const topApp = session.topApps.length > 0 ? session.topApps[0] : null;
  const iconDataUrl = topApp ? session.appIcons[topApp.bundleId] : null;
  const iconColor = topApp ? session.appColors[topApp.bundleId] : null;

  return (
    <button
      onClick={() => onClick(session)}
      className="w-full aspect-[3/1.2] border border-gray-300 rounded-lg p-3 py-4 hover:bg-gray-50 cursor-pointer transition-colors text-left relative"
    >
      {/* Top-left: Duration */}
      <div className="absolute top-3 left-3">
        <span className="text-lg font-semibold tabular-nums">
          {formatDuration(totalDurationSecs)}
        </span>
      </div>

      {/* Top-right: Status badge */}
      <div className="absolute top-3 right-3">
        <span
          className={`text-xs px-2 py-0.5 border rounded ${statusBadge.className} font-normal`}
        >
          {statusBadge.text}
        </span>
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

