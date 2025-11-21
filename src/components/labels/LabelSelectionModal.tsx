import { useEffect } from "react";
import type { Label } from "@/types/label";
import { isUserTyping } from "@/utils/keyboardUtils";
import { KeyBox } from "@/components/ui/KeyBox";

interface LabelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  labels: Label[];
  currentLabelId: number | null;
  onSelectLabel: (labelId: number | null) => void;
  onAddNew: () => void;
}

export function LabelSelectionModal({
  isOpen,
  onClose,
  labels,
  currentLabelId,
  onSelectLabel,
  onAddNew,
}: LabelSelectionModalProps) {
  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const stopEvent = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Block arrow keys completely when modal is open
      if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
        stopEvent(event);
        return;
      }

      // Ignore shortcuts when user is typing
      if (isUserTyping()) return;

      // Esc: close modal
      if (event.key === "Escape") {
        stopEvent(event);
        onClose();
        return;
      }

      // Number keys 1-8: select label by index
      const num = parseInt(event.key);
      if (num >= 1 && num <= 8) {
        stopEvent(event);
        const labelIndex = num - 1;
        if (labelIndex < labels.length) {
          onSelectLabel(labels[labelIndex].id);
        }
        return;
      }

      // 0: select "No Label"
      if (event.key === "0") {
        stopEvent(event);
        onSelectLabel(null);
        return;
      }

      // N: add new label (only if less than 8 labels)
      if ((event.key === "n" || event.key === "N") && labels.length < 8) {
        stopEvent(event);
        onAddNew();
        return;
      }
    };

    // Capture phase prevents underlying views from responding to keys while the modal is open
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, labels, onSelectLabel, onClose, onAddNew]);

  if (!isOpen) return null;

  // Helper to convert hex to rgba for light backgrounds
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  return (
    <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white shadow-xl p-8 pt-16 w-96 relative">
        {/* Close button - top right */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex items-center gap-2 text-sm text-gray-600 hover:text-black"
        >
          <KeyBox hovered={false} className="!w-12">esc</KeyBox>
          <span>Close</span>
        </button>

        {/* Labels list - centered */}
        <div className="flex flex-col gap-3 items-center">
          {/* No Label Option */}
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => onSelectLabel(null)}
          >
            <KeyBox hovered={false}>0</KeyBox>
            <button
              className={`border border-gray-300 px-3 py-1 text-sm font-medium whitespace-nowrap flex items-center justify-center ${
                currentLabelId === null ? "text-gray-400" : "text-gray-400 opacity-60"
              } hover:opacity-100`}
              style={{ width: '126px', backgroundColor: 'transparent' }}
            >
              No Label
            </button>
          </div>

          {/* Label Options */}
          {labels.map((label, index) => {
            const rgb = hexToRgb(label.color);
            const lightBg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : label.color;
            const isCurrentLabel = currentLabelId === label.id;

            return (
              <div
                key={label.id}
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => onSelectLabel(label.id)}
              >
                <KeyBox hovered={false}>{index + 1}</KeyBox>
                <button
                  className={`border px-3 py-1 text-sm font-medium whitespace-nowrap flex items-center justify-center ${
                    isCurrentLabel ? "" : "opacity-60"
                  } hover:opacity-100`}
                  style={{
                    backgroundColor: isCurrentLabel ? label.color : lightBg,
                    borderColor: label.color,
                    color: isCurrentLabel ? 'white' : label.color,
                    width: '126px',
                  }}
                >
                  {label.name}
                </button>
              </div>
            );
          })}

          {/* Add New Option */}
          {labels.length < 8 && (
            <div
              className="flex items-center gap-2 mt-3 cursor-pointer"
              onClick={onAddNew}
            >
              <KeyBox hovered={false}>N</KeyBox>
              <button
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center"
                style={{ width: '126px' }}
              >
                + New Label
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
