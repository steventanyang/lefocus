import { useState, useEffect } from "react";
import type { TimerStatus, TimerMode } from "@/types/timer";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping } from "@/utils/keyboardUtils";

interface TimerControlsProps {
  status: TimerStatus;
  mode: TimerMode;
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  startDisabled?: boolean;
  controlsVisible?: boolean;
}

export function TimerControls({
  status,
  mode,
  onEnd,
  onCancel,
  controlsVisible = true,
}: TimerControlsProps) {
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [endConfirming, setEndConfirming] = useState(false);

  // Reset confirmation states when status changes or controls hidden
  useEffect(() => {
    setCancelConfirming(false);
    setEndConfirming(false);
  }, [status, controlsVisible]);

  // Handle keyboard events for confirmation
  useEffect(() => {
    if (status === "idle") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) {
        return;
      }

      // ESC key handling for Cancel confirmation
      if (event.key === "Escape") {
        if (status === "running" && (mode === "stopwatch" || mode === "countdown" || mode === "break")) {
          // Cancel button is visible
          if (cancelConfirming) {
            // Second ESC: actually cancel
            event.preventDefault();
            event.stopPropagation();
            setCancelConfirming(false);
            onCancel();
          } else {
            // First ESC: enter confirmation state
            event.preventDefault();
            event.stopPropagation();
            setCancelConfirming(true);
            setEndConfirming(false); // Cancel any end confirmation
          }
        } else if (cancelConfirming || endConfirming) {
          // Exit confirmation state if in one
          event.preventDefault();
          event.stopPropagation();
          setCancelConfirming(false);
          setEndConfirming(false);
        }
        return;
      }

      // Return/Enter key handling for End confirmation
      if (event.key === "Enter") {
        // Only handle if End button is visible
        const isEndVisible = 
          (status === "running" && mode === "stopwatch") || 
          (status === "stopped");
        
        if (isEndVisible) {
          // For stopwatch running: require confirmation
          if (status === "running" && mode === "stopwatch") {
            if (endConfirming) {
              // Second Enter: actually end
              event.preventDefault();
              event.stopPropagation();
              setEndConfirming(false);
              onEnd();
            } else {
              // First Enter: enter confirmation state
              event.preventDefault();
              event.stopPropagation();
              setEndConfirming(true);
              setCancelConfirming(false); // Cancel any cancel confirmation
            }
          } else if (status === "stopped") {
            // Timer/Break stopped: execute immediately (no confirmation)
            event.preventDefault();
            event.stopPropagation();
            onEnd();
          }
        }
        return;
      }

      // Any other key exits confirmation states
      if (cancelConfirming || endConfirming) {
        setCancelConfirming(false);
        setEndConfirming(false);
      }
    };

    // Use capture phase to ensure we catch events before other handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [status, mode, controlsVisible, cancelConfirming, endConfirming, onEnd, onCancel]);

  const buttonClass = "bg-transparent border border-black text-black px-8 py-3.5 text-base font-normal cursor-pointer w-[160px] hover:bg-black hover:text-white hover:transition-none transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black";
  const primaryClass = `${buttonClass} font-semibold`;
  const secondaryClass = `${buttonClass} font-semibold`;

  // Confirmation button classes (black background)
  const primaryConfirmClass = `${buttonClass.replace("bg-transparent", "bg-black").replace("text-black", "text-white")} font-semibold`;
  const secondaryConfirmClass = `${buttonClass.replace("bg-transparent", "bg-black").replace("text-black", "text-white")} font-semibold`;

  if (status === "idle") {
    // Start button is rendered separately in TimerView (bottom right)
    return null;
  }

  const handleCancelClick = () => {
    // Mouse clicks execute immediately, no confirmation needed
    setCancelConfirming(false);
    setEndConfirming(false);
    onCancel();
  };

  const handleEndClick = () => {
    // Mouse clicks execute immediately, no confirmation needed
    setCancelConfirming(false);
    setEndConfirming(false);
    onEnd();
  };

  if (status === "running") {
    // In stopwatch mode, show both End and Cancel buttons
    if (mode === "stopwatch") {
      return (
        <div className={`fixed bottom-8 right-8 flex gap-6 z-10`}>
          {/* End button with confirmation */}
          <div className="flex flex-col items-start gap-2">
            {endConfirming ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <KeyBox className="w-16 h-6 px-2 py-1">return</KeyBox>
                <span>to confirm</span>
              </div>
            ) : (
              <div className={`transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
                <KeyBox className="w-16 h-6 px-2 py-1">return</KeyBox>
              </div>
            )}
            <button onClick={handleEndClick} className={endConfirming ? primaryConfirmClass : primaryClass}>
              End
            </button>
          </div>
          {/* Cancel button with confirmation */}
          <div className="flex flex-col items-start gap-2">
            {cancelConfirming ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <KeyBox className="w-12 h-6 py-1">esc</KeyBox>
                <span>to confirm</span>
              </div>
            ) : (
              <div className={`transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
                <KeyBox className="w-12 h-6 py-1">esc</KeyBox>
              </div>
            )}
            <button onClick={handleCancelClick} className={cancelConfirming ? secondaryConfirmClass : secondaryClass}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // In countdown and break modes, only show Cancel
    return (
      <div className={`fixed bottom-8 right-8 flex flex-col items-start gap-2 z-10`}>
        {cancelConfirming ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <KeyBox className="w-12 h-6 py-1">esc</KeyBox>
            <span>to confirm</span>
          </div>
        ) : (
          <div className={`transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
            <KeyBox className="w-12 h-6 py-1">esc</KeyBox>
          </div>
        )}
        <button onClick={handleCancelClick} className={cancelConfirming ? secondaryConfirmClass : secondaryClass}>
          Cancel
        </button>
      </div>
    );
  }

  if (status === "stopped") {
    // Timer/Break stopped: End button, no confirmation needed
    return (
      <div className={`fixed bottom-8 right-8 flex flex-col items-start gap-2 z-10`}>
        <div className={`transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
          <KeyBox className="w-16 h-6 px-2 py-1">return</KeyBox>
        </div>
        <button onClick={handleEndClick} className={primaryClass}>
          End
        </button>
      </div>
    );
  }

  return null;
}
