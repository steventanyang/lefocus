import { BlockSessionCard } from "@/components/session/BlockSessionCard";
import { groupSessionsByDay } from "@/utils/dateUtils";
import type { SessionSummary } from "@/types/timer";

interface BlockViewProps {
  sessions: SessionSummary[];
  onClick: (session: SessionSummary) => void;
  selectedIndex: number | null;
  cardRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}

export function BlockView({ sessions, onClick, selectedIndex, cardRefs }: BlockViewProps) {
  const dayGroups = groupSessionsByDay(sessions);
  
  // Flatten sessions to calculate index
  let flatIndex = 0;

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
            {dayGroup.sessions.map((session) => {
              const currentIndex = flatIndex++;
              return (
                <BlockSessionCard
                  key={session.id}
                  ref={(el) => {
                    cardRefs.current[currentIndex] = el;
                  }}
                  session={session}
                  onClick={onClick}
                  isSelected={selectedIndex === currentIndex}
                />
              );
            })}
          </div>

          {/* Spacing between day groups (except for last one) */}
          {groupIndex < dayGroups.length - 1 && <div className="h-4" />}
        </div>
      ))}
    </div>
  );
}

