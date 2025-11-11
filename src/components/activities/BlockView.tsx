import { BlockSessionCard } from "@/components/session/BlockSessionCard";
import { groupSessionsByDay } from "@/utils/dateUtils";
import type { SessionSummary } from "@/types/timer";

interface BlockViewProps {
  sessions: SessionSummary[];
  onClick: (session: SessionSummary) => void;
}

export function BlockView({ sessions, onClick }: BlockViewProps) {
  const dayGroups = groupSessionsByDay(sessions);

  return (
    <div className="flex flex-col gap-8">
      {dayGroups.map((dayGroup, groupIndex) => (
        <div key={dayGroup.date.toISOString()} className="flex flex-col gap-4">
          {/* Day header */}
          <div className="text-base font-light tracking-wide">
            {dayGroup.dateLabel}
          </div>

          {/* Sessions grid - 3 columns */}
          <div className="grid grid-cols-3 gap-4">
            {dayGroup.sessions.map((session) => (
              <BlockSessionCard
                key={session.id}
                session={session}
                onClick={onClick}
              />
            ))}
          </div>

          {/* Spacing between day groups (except for last one) */}
          {groupIndex < dayGroups.length - 1 && <div className="h-4" />}
        </div>
      ))}
    </div>
  );
}

