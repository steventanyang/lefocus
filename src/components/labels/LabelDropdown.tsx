import { useEffect, useRef } from "react";
import type { Label } from "@/types/label";
import { isUserTyping } from "@/utils/keyboardUtils";

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

      // Number keys 1-9: select label by index
      const num = parseInt(event.key);
      if (num >= 1 && num <= 9) {
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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, labels, onSelectLabel, onClose]);

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

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 mt-2 flex flex-col gap-1"
    >
      {/* No Label Option */}
      <button
        onClick={() => onSelectLabel(null)}
        className="flex items-center gap-2 group"
      >
        <span className="text-xs text-gray-400 font-mono w-4">0</span>
        <div
          className={`flex-1 border border-gray-300 px-3 py-1 text-sm font-medium transition-opacity ${
            currentLabelId === null ? "bg-gray-100 text-gray-600" : "bg-gray-100 text-gray-600 opacity-60"
          } group-hover:opacity-100`}
        >
          No Label
        </div>
      </button>

      {/* Label Options */}
      {labels.map((label, index) => {
        const rgb = hexToRgb(label.color);
        const lightBg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : label.color;
        const isSelected = currentLabelId === label.id;

        return (
          <button
            key={label.id}
            onClick={() => onSelectLabel(label.id)}
            className="flex items-center gap-2 group"
          >
            <span className="text-xs text-gray-400 font-mono w-4">{index + 1}</span>
            <div
              className={`flex-1 border px-3 py-1 text-sm font-medium transition-opacity ${
                isSelected ? "" : "opacity-60"
              } group-hover:opacity-100`}
              style={{
                backgroundColor: lightBg,
                borderColor: label.color,
                color: label.color,
              }}
            >
              {label.name}
            </div>
          </button>
        );
      })}

      {/* Add New Option */}
      {labels.length < 9 && (
        <button
          onClick={onAddNew}
          className="mt-2 text-sm text-gray-500 hover:text-gray-700 text-left pl-6"
        >
          + Add New Label
        </button>
      )}

      {/* Max labels reached */}
      {labels.length >= 9 && (
        <div className="mt-2 text-xs text-gray-400 pl-6">
          Maximum 9 labels reached
        </div>
      )}
    </div>
  );
}
