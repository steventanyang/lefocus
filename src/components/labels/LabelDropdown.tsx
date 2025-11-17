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

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2"
    >
      {/* No Label Option */}
      <button
        onClick={() => onSelectLabel(null)}
        className={`w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center justify-between ${
          currentLabelId === null ? "bg-gray-50" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
          <span className="text-gray-500">No Label</span>
        </div>
        <span className="text-xs text-gray-400 font-mono">0</span>
      </button>

      {/* Separator */}
      {labels.length > 0 && <div className="h-px bg-gray-200 my-2" />}

      {/* Label Options */}
      {labels.map((label, index) => (
        <button
          key={label.id}
          onClick={() => onSelectLabel(label.id)}
          className={`w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center justify-between ${
            currentLabelId === label.id ? "bg-gray-50" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            <span>{label.name}</span>
          </div>
          <span className="text-xs text-gray-400 font-mono">{index + 1}</span>
        </button>
      ))}

      {/* Add New Option */}
      {labels.length < 9 && (
        <>
          <div className="h-px bg-gray-200 my-2" />
          <button
            onClick={onAddNew}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 text-blue-600 font-medium"
          >
            + Add New Label
          </button>
        </>
      )}

      {/* Max labels reached */}
      {labels.length >= 9 && (
        <>
          <div className="h-px bg-gray-200 my-2" />
          <div className="px-4 py-2 text-xs text-gray-400">
            Maximum 9 labels reached
          </div>
        </>
      )}
    </div>
  );
}
