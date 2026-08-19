import { useEffect, useMemo, useRef } from "react";
import { AppDuration } from "@/types/segment";
import { getAppColor } from "@/constants/appColors";
import { AppleLogo, shouldShowAppleLogo } from "@/utils/appUtils";
import { KeyBox } from "@/components/ui/KeyBox";
import { useAppSessionsInfinite } from "@/hooks/queries";
import { formatDuration } from "@/utils/formatUtils";

interface AppDetailsModalProps {
  app: AppDuration;
  startTime: string;
  endTime: string;
  labelId: number | null;
  onClose: () => void;
}

function formatDateRange(startValue: string, endValue: string): string {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  if (start.toDateString() === end.toDateString()) return formatter.format(start);
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

function formatSessionTime(startValue: string, endValue: string | null): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const start = formatter.format(new Date(startValue));
  return endValue ? `${start}–${formatter.format(new Date(endValue))}` : start;
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function AppDetailsModal({
  app,
  startTime,
  endTime,
  labelId,
  onClose,
}: AppDetailsModalProps) {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useAppSessionsInfinite(app.bundleId, startTime, endTime, labelId);
  const sessions = useMemo(() => data?.pages.flat() ?? [], [data]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scrollContainerRef.current, rootMargin: "160px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [onClose]);

  const appColor = getAppColor(app.bundleId, { iconColor: app.iconColor });

  return (
    <div
      className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-[1000] p-8"
      onClick={onClose}
    >
      <div
        ref={scrollContainerRef}
        className="bg-white max-w-[600px] w-full max-h-[90vh] overflow-y-auto flex flex-col shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between items-start p-6">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            {shouldShowAppleLogo(app.bundleId, app.appName) ? (
              <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center text-gray-800">
                <AppleLogo className="w-12 h-12" />
              </div>
            ) : app.iconDataUrl ? (
              <img
                src={app.iconDataUrl}
                alt={app.appName || app.bundleId}
                className="w-14 h-14 flex-shrink-0"
              />
            ) : (
              <div
                className="w-14 h-14 border border-black flex-shrink-0"
                style={{ backgroundColor: appColor }}
              />
            )}

            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-xl font-semibold break-words">
                {app.appName || app.bundleId}
              </span>
              <span className="text-sm font-light text-gray-600">
                {app.percentage.toFixed(0)}% of time
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <KeyBox className="w-12 h-6 py-1">esc</KeyBox>
            <button
              className="bg-transparent border-none text-base font-normal cursor-pointer p-0 transition-opacity duration-200 hover:opacity-70"
              onClick={onClose}
              aria-label="close"
            >
              close
            </button>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-base font-normal text-gray-800">sessions</h3>
            <span className="text-sm font-light text-gray-600 text-right">
              {formatDateRange(startTime, endTime)}
            </span>
          </div>

          {isLoading ? (
            <div className="text-base font-light text-center py-8">loading sessions...</div>
          ) : isError ? (
            <div className="text-base font-light text-center py-8">failed to load sessions</div>
          ) : sessions.length === 0 ? (
            <div className="text-base font-light text-center py-8 text-gray-500">
              no sessions found
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {sessions.map((session) => {
                const sessionShare =
                  session.sessionDurationSecs > 0
                    ? (session.appDurationSecs / session.sessionDurationSecs) * 100
                    : 0;
                return (
                  <div
                    key={session.sessionId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-8"
                  >
                    <div className="min-w-0">
                      <div className="text-xl font-semibold leading-none tabular-nums">
                        {formatDuration(session.appDurationSecs)}
                      </div>
                      <div className="mt-2 text-sm font-light text-gray-500 tabular-nums">
                        {sessionShare.toFixed(0)}% of session
                      </div>
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="text-base font-normal leading-none tabular-nums">
                        {formatSessionDate(session.startedAt)}
                      </div>
                      <div className="mt-2 text-sm font-light text-gray-500 tabular-nums">
                        {formatSessionTime(session.startedAt, session.stoppedAt)}
                        {session.status === "Interrupted" ? " · interrupted" : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={loadMoreRef} className="h-1" aria-hidden="true" />
              {isFetchingNextPage && (
                <div className="text-sm font-light text-center text-gray-500">
                  loading more...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
