import { useMemo } from "react";
import type { DailyActivity } from "@/types/stats";
import { formatDuration } from "@/utils/formatUtils";

interface YearActivityHeatmapProps {
  activity: DailyActivity[];
  year: number;
}

interface ActivityDay {
  date: Date;
  durationSecs: number;
  inPeriod: boolean;
}

interface ActivityPeriod {
  weeks: ActivityDay[][];
  monthLabels: Array<string | null>;
}

const DAY_LABELS = ["", "mon", "", "wed", "", "fri", ""];
const LEVEL_COLORS = [
  "bg-[#f3f4f3]",
  "bg-[#e3eee6]",
  "bg-[#b8d1bf]",
  "bg-[#739b7d]",
  "bg-[#2f6342]",
];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getLevel(durationSecs: number, thresholds: number[]): number {
  if (durationSecs <= 0) return 0;
  if (durationSecs <= thresholds[0]) return 1;
  if (durationSecs <= thresholds[1]) return 2;
  if (durationSecs <= thresholds[2]) return 3;
  return 4;
}

function dayOrdinal(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function formatCompactDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(seconds)}s`;
}

export function YearActivityHeatmap({
  activity,
  year,
}: YearActivityHeatmapProps) {
  const { periods, thresholds, summary } = useMemo(() => {
    const totals = new Map<string, number>();

    for (const day of activity) {
      if (!day.date.startsWith(`${year}-`)) continue;
      totals.set(day.date, day.durationSecs);
    }

    const buildPeriod = (startMonth: number, endMonth: number): ActivityPeriod => {
      const periodStart = new Date(year, startMonth, 1);
      const periodEnd = new Date(year, endMonth + 1, 0);
      const gridStart = addDays(periodStart, -periodStart.getDay());
      const gridEnd = addDays(periodEnd, 6 - periodEnd.getDay());
      const days: ActivityDay[] = [];

      for (
        let date = gridStart;
        date <= gridEnd;
        date = addDays(date, 1)
      ) {
        days.push({
          date,
          durationSecs: totals.get(dateKey(date)) ?? 0,
          inPeriod: date >= periodStart && date <= periodEnd,
        });
      }

      const weeks: ActivityDay[][] = [];
      for (let index = 0; index < days.length; index += 7) {
        weeks.push(days.slice(index, index + 7));
      }

      const monthLabels = weeks.map((week) => {
        const firstDayInMonth = week.find(
          (day) => day.inPeriod && day.date.getDate() === 1
        );
        return firstDayInMonth
          ? firstDayInMonth.date.toLocaleDateString("en-US", { month: "short" })
          : null;
      });

      return { weeks, monthLabels };
    };

    const activeDurations = Array.from(totals.values())
      .filter((seconds) => seconds > 0)
      .sort((left, right) => left - right);
    const percentile = (value: number) =>
      activeDurations[Math.floor((activeDurations.length - 1) * value)] ?? 0;

    const activeOrdinals = Array.from(totals.entries())
      .filter(([, seconds]) => seconds > 0)
      .map(([key]) => dayOrdinal(key))
      .sort((left, right) => left - right);

    let longestStreak = 0;
    let runningStreak = 0;
    let previousOrdinal: number | null = null;
    for (const ordinal of activeOrdinals) {
      runningStreak = previousOrdinal === ordinal - 1 ? runningStreak + 1 : 1;
      longestStreak = Math.max(longestStreak, runningStreak);
      previousOrdinal = ordinal;
    }

    const today = new Date();
    const referenceDate =
      year === today.getFullYear()
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
        : new Date(year, 11, 31);
    const activeOrdinalSet = new Set(activeOrdinals);
    let cursor = dayOrdinal(dateKey(referenceDate));
    if (!activeOrdinalSet.has(cursor) && activeOrdinalSet.has(cursor - 1)) {
      cursor -= 1;
    }

    let currentStreak = 0;
    while (activeOrdinalSet.has(cursor)) {
      currentStreak += 1;
      cursor -= 1;
    }

    const totalDuration = activeDurations.reduce(
      (total, duration) => total + duration,
      0
    );

    return {
      periods: [buildPeriod(0, 5), buildPeriod(6, 11)],
      thresholds: [percentile(0.25), percentile(0.5), percentile(0.75)],
      summary: {
        activeDays: activeDurations.length,
        currentStreak,
        longestStreak,
        averageDuration:
          activeDurations.length > 0
            ? totalDuration / activeDurations.length
            : 0,
      },
    };
  }, [activity, year]);

  return (
    <section className="flex flex-row-reverse items-start gap-6" aria-label={`${year} focus activity`}>
      <div className="flex min-w-0 flex-1 flex-col items-end gap-4 overflow-x-auto">
        {periods.map((period, periodIndex) => (
          <div key={periodIndex} className="w-[550px] shrink-0">
            <div className="ml-8 mb-1.5 grid grid-flow-col auto-cols-[16px] gap-[3px] text-xs font-light text-gray-500">
              {period.monthLabels.map((label, index) => (
                <div key={index} className="h-4 whitespace-nowrap">
                  {label}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="grid grid-rows-7 gap-[3px] w-6 text-[10px] font-light leading-[16px] text-gray-500">
                {DAY_LABELS.map((label, index) => (
                  <span key={index} className="h-[16px]">
                    {label}
                  </span>
                ))}
              </div>

              <div className="grid grid-flow-col auto-cols-[16px] grid-rows-7 gap-[3px]">
                {period.weeks.flatMap((week) =>
                  week.map((day) => {
                    if (!day.inPeriod) {
                      return (
                        <span
                          key={dateKey(day.date)}
                          className="w-[16px] h-[16px]"
                          aria-hidden="true"
                        />
                      );
                    }

                    const level = getLevel(day.durationSecs, thresholds);
                    const dateLabel = day.date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                    const durationLabel =
                      day.durationSecs > 0
                        ? formatDuration(day.durationSecs)
                        : "no focus time";

                    return (
                      <span
                        key={dateKey(day.date)}
                        className={`w-[16px] h-[16px] border border-black/5 ${LEVEL_COLORS[level]}`}
                        title={`${dateLabel}: ${durationLabel}`}
                        aria-label={`${dateLabel}: ${durationLabel}`}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <aside className="flex w-28 shrink-0 self-stretch flex-col pt-5">
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-xs font-light text-gray-500">active days</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-800">
              {summary.activeDays}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-light text-gray-500">current streak</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-800">
              {summary.currentStreak}d
            </dd>
          </div>
          <div>
            <dt className="text-xs font-light text-gray-500">longest streak</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-800">
              {summary.longestStreak}d
            </dd>
          </div>
          <div>
            <dt className="text-xs font-light text-gray-500">avg. active day</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-800">
              {formatCompactDuration(summary.averageDuration)}
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center gap-1 text-[10px] font-light text-gray-500">
          <span>less</span>
          {LEVEL_COLORS.map((color, level) => (
            <span
              key={color}
              className={`w-[10px] h-[10px] shrink-0 border border-black/5 ${color}`}
              aria-label={`activity level ${level}`}
            />
          ))}
          <span>more</span>
        </div>
      </aside>
    </section>
  );
}
