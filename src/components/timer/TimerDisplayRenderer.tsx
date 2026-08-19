interface TimerDisplayRendererProps {
  timeStr: string;
  isEditing?: boolean;
}

/** Keep every clock group visible while softly de-emphasizing leading zeros during entry. */
export function TimerDisplayRenderer({
  timeStr,
  isEditing = false,
}: TimerDisplayRendererProps) {
  const firstNonZeroDigit = timeStr.search(/[1-9]/);
  const dimThroughIndex = firstNonZeroDigit === -1 ? timeStr.length : firstNonZeroDigit;

  return (
    <>
      {timeStr.split("").map((character, index) => {
        const isLeadingZero = character === "0" && index < dimThroughIndex;
        const isLeadingSeparator = character === ":" && index < dimThroughIndex;

        return (
          <span
            key={`${index}-${character}`}
            className={isEditing && (isLeadingZero || isLeadingSeparator) ? "opacity-20" : ""}
          >
            {character}
          </span>
        );
      })}
    </>
  );
}
