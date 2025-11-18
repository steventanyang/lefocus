import { useEffect, useRef } from "react";
import type { Label } from "@/types/label";
import { isUserTyping } from "@/utils/keyboardUtils";
import { KeyBox } from "@/components/ui/KeyBox";

interface LabelDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  labels: Label[];
  currentLabelId: number | null;
  onSelectLabel: (labelId: number | null) => void;
  onAddNew: () => void;
}

export function LabelDropdown({
  isOpen,
  onClose,
  labels,
  currentLabelId,
  onSelectLabel,
  onAddNew,
}: LabelDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing
      if (isUserTyping()) return;

      // Esc: close dropdown
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      // Number keys 1-8: select label by index
      const num = parseInt(event.key);
      if (num >= 1 && num <= 8) {
        event.preventDefault();
        const labelIndex = num - 1;
        if (labelIndex < labels.length) {
          onSelectLabel(labels[labelIndex].id);
        }
        return;
      }

      // 0: select "No Label"
      if (event.key === "0") {
        event.preventDefault();
        onSelectLabel(null);
        return;
      }

      // N: add new label (only if less than 8 labels)
      if ((event.key === "n" || event.key === "N") && labels.length < 8) {
        event.preventDefault();
        onAddNew();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, labels, onSelectLabel, onClose, onAddNew]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

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

  // Calculate the width needed for all labels (find the longest one)
  const allOptions = [
    { text: "No Label", isLabel: false },
    ...labels.map(l => ({ text: l.name, isLabel: true }))
  ];

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 top-full mt-4 right-0 flex flex-col gap-2 items-end"
    >
      {/* No Label Option */}
      <div className="flex items-center gap-2">
        <KeyBox hovered={false}>0</KeyBox>
        <button
          onClick={() => onSelectLabel(null)}
          className={`border border-gray-300 px-3 py-1 text-sm font-medium transition-opacity whitespace-nowrap ${
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
        const isSelected = currentLabelId === label.id;

        return (
          <div key={label.id} className="flex items-center gap-2">
            <KeyBox hovered={false}>{index + 1}</KeyBox>
            <button
              onClick={() => onSelectLabel(label.id)}
              className={`border px-3 py-1 text-sm font-medium transition-opacity whitespace-nowrap ${
                isSelected ? "" : "opacity-60"
              } hover:opacity-100`}
              style={{
                backgroundColor: lightBg,
                borderColor: label.color,
                color: label.color,
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
        <div className="flex items-center gap-2 mt-3">
          <KeyBox hovered={false}>N</KeyBox>
          <button
            onClick={onAddNew}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center"
            style={{ width: '126px' }}
          >
            + New Label
          </button>
        </div>
      )}
    </div>
  );
}
