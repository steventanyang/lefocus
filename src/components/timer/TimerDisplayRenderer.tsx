interface TimerDisplayRendererProps {
  timeStr: string;
  editableValueForColon?: number;
  hideLeadingZerosWhenRunning?: boolean;
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
  const [minutes, seconds] = timeStr.split(":");
  const minDigits = minutes.split("");
  const secDigits = seconds.split("");

  // When running and minutes are 00, hide the "00:" part and show only seconds
  const shouldHideMinutes = hideLeadingZerosWhenRunning && minutes === "00";
  
  // When running and minutes are not 00, hide the leading zero in minutes (e.g., "2:46" instead of "02:46")
  const shouldHideLeadingMinuteZero = hideLeadingZerosWhenRunning && minutes !== "00" && minDigits[0] === "0";

  // Only apply leading zero styling when editing (editableValueForColon is provided)
  // When running, all digits should be displayed at full opacity
  const isEditing = editableValueForColon !== undefined;
  
  // Determine which digits are leading zeros (only when editing)
  const isLeadingZero1 = isEditing && minDigits[0] === "0";
  const isLeadingZero2 = isEditing && minDigits[0] === "0" && minDigits[1] === "0";
  const isLeadingZero3 = isEditing && minDigits[0] === "0" && minDigits[1] === "0" && secDigits[0] === "0";
  const isLeadingZero4 = isEditing && minDigits[0] === "0" && minDigits[1] === "0" && secDigits[0] === "0" && secDigits[1] === "0";

  // Colon should be grey until we have 3 numbers (editableValue >= 100) - only when editing
  // Use same opacity as leading zeros (opacity-20) to match the light grey color
  const colonGrey = editableValueForColon !== undefined && editableValueForColon < 100;

  if (shouldHideMinutes) {
    // Show only seconds when running and minutes are 00
    // If seconds is less than 10, show only the single digit (e.g., "5" instead of "05")
    const secondsValue = parseInt(seconds, 10);
    if (secondsValue < 10) {
      return <>{secDigits[1]}</>;
    }
    return (
      <>
        <span className={isLeadingZero3 ? "opacity-20" : ""}>{secDigits[0]}</span>
        <span className={isLeadingZero4 ? "opacity-20" : ""}>{secDigits[1]}</span>
      </>
    );
  }

  // When running and minutes have a leading zero, hide it (e.g., "2:46" instead of "02:46")
  if (shouldHideLeadingMinuteZero) {
    return (
      <>
        <span>{minDigits[1]}</span>
        <span>:</span>
        <span>{secDigits[0]}</span>
        <span>{secDigits[1]}</span>
      </>
    );
  }

  return (
    <>
      <span className={isLeadingZero1 ? "opacity-20" : ""}>{minDigits[0]}</span>
      <span className={isLeadingZero2 ? "opacity-20" : ""}>{minDigits[1]}</span>
      <span className={colonGrey ? "opacity-20" : ""}>:</span>
      <span className={isLeadingZero3 ? "opacity-20" : ""}>{secDigits[0]}</span>
      <span className={isLeadingZero4 ? "opacity-20" : ""}>{secDigits[1]}</span>
    </>
  );
}

