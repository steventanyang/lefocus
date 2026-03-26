interface TimerDisplayRendererProps {
  timeStr: string;
  editableValueForColon?: number;
  hideLeadingZerosWhenRunning?: boolean;
}

function splitMmSs(timeStr: string): { minutes: string; seconds: string } {
  const colon = timeStr.indexOf(":");
  if (colon < 0) {
    return { minutes: timeStr, seconds: "" };
  }
  return {
    minutes: timeStr.slice(0, colon),
    seconds: timeStr.slice(colon + 1),
  };
}

function minuteDigitIsDimmed(minutes: string, index: number, isEditing: boolean): boolean {
  if (!isEditing || minutes.length === 0) return false;
  if (/^0+$/.test(minutes)) return index < minutes.length;
  const firstNon = minutes.search(/[1-9]/);
  return index < firstNon;
}

function secondDigitIsDimmed(
  minutes: string,
  seconds: string,
  index: number,
  isEditing: boolean
): boolean {
  if (!isEditing) return false;
  if (parseInt(minutes, 10) !== 0) return false;
  if (/^0+$/.test(seconds)) return index < seconds.length;
  const firstNon = seconds.search(/[1-9]/);
  return index < firstNon;
}

/**
 * Renders time string with leading zero styling and conditional display logic
 * - Leading zeros have reduced opacity
 * - Colon is grey until 3 digits are entered (when editing)
 * - When running and < 1 minute, hides "00:" and shows only seconds
 * - When running and < 10 seconds, shows only single digit
 */
export function TimerDisplayRenderer({
  timeStr,
  editableValueForColon,
  hideLeadingZerosWhenRunning,
}: TimerDisplayRendererProps) {
  const { minutes, seconds } = splitMmSs(timeStr);
  const minDigits = minutes.split("");
  const secDigits = seconds.split("");

  const shouldHideMinutes =
    hideLeadingZerosWhenRunning && minutes === "00";

  const shouldHideLeadingMinuteZero =
    hideLeadingZerosWhenRunning &&
    minutes !== "00" &&
    minutes.startsWith("0") &&
    minutes.length > 1;

  const isEditing = editableValueForColon !== undefined;

  const colonGrey = editableValueForColon !== undefined && editableValueForColon < 100;

  if (shouldHideMinutes) {
    const secondsValue = parseInt(seconds, 10);
    if (secondsValue < 10) {
      return <>{secDigits[1]}</>;
    }
    return (
      <>
        <span
          className={
            secondDigitIsDimmed(minutes, seconds, 0, isEditing) ? "opacity-20" : ""
          }
        >
          {secDigits[0]}
        </span>
        <span
          className={
            secondDigitIsDimmed(minutes, seconds, 1, isEditing) ? "opacity-20" : ""
          }
        >
          {secDigits[1]}
        </span>
      </>
    );
  }

  if (shouldHideLeadingMinuteZero) {
    const rest = minutes.slice(1);
    return (
      <>
        {rest.split("").map((ch, i) => (
          <span key={`m-${i}`}>{ch}</span>
        ))}
        <span>:</span>
        <span>{secDigits[0]}</span>
        <span>{secDigits[1]}</span>
      </>
    );
  }

  return (
    <>
      {minDigits.map((ch, i) => (
        <span
          key={`m-${i}`}
          className={minuteDigitIsDimmed(minutes, i, isEditing) ? "opacity-20" : ""}
        >
          {ch}
        </span>
      ))}
      <span className={colonGrey ? "opacity-20" : ""}>:</span>
      {secDigits.map((ch, i) => (
        <span
          key={`s-${i}`}
          className={secondDigitIsDimmed(minutes, seconds, i, isEditing) ? "opacity-20" : ""}
        >
          {ch}
        </span>
      ))}
    </>
  );
}
