import { useEffect, useRef, useState } from "react";
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
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);

  // Handle open/close animation states
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      setIsAnimatingIn(true);
      // Trigger animation after render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimatingIn(false);
        });
      });
    } else if (shouldRender) {
      // Start closing animation
      setIsClosing(true);
      // Calculate total items (No Label + labels + New Label if applicable)
      const totalItems = 1 + labels.length + (labels.length < 8 ? 1 : 0);
      // Stagger delay: 25ms per item for closing (faster)
      const animationDuration = totalItems * 25 + 100; // Extra padding for last item
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, animationDuration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, labels.length, shouldRender]);

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
          onClose();
        }
        return;
      }

      // 0: select "No Label"
      if (event.key === "0") {
        event.preventDefault();
        onSelectLabel(null);
        onClose();
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

  if (!shouldRender) return null;

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

  // Calculate animation index (for closing, reverse order)
  const getAnimationDelay = (index: number) => {
    const totalItems = 1 + labels.length + (labels.length < 8 ? 1 : 0);
    if (isClosing) {
      // Reverse order for closing: bottom items fade first
      return (totalItems - 1 - index) * 25; // 25ms stagger
    } else {
      // Normal order for opening: top items fade first
      return index * 12; // 12ms stagger (half of closing - much faster)
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 top-full mt-4 right-0 flex flex-col gap-2 items-end"
    >
      {/* No Label Option */}
      <div
        className="flex items-center gap-2"
        style={{
          opacity: isClosing ? 0 : isAnimatingIn ? 0 : 1,
          transform: isClosing ? 'translateY(-8px)' : isAnimatingIn ? 'translateY(-8px)' : 'translateY(0)',
          transition: `opacity ${isClosing ? '100ms' : '50ms'} ease-out ${getAnimationDelay(0)}ms, transform ${isClosing ? '100ms' : '50ms'} ease-out ${getAnimationDelay(0)}ms`,
        }}
      >
        <KeyBox hovered={false}>0</KeyBox>
        <div
          onClick={() => onSelectLabel(null)}
          className={`border border-gray-300 px-3 py-1 text-sm font-medium transition-colors flex items-center justify-center min-w-0 cursor-pointer ${
            currentLabelId === null ? "text-gray-600" : "text-gray-600 opacity-60 hover:border-gray-400 hover:text-gray-700"
          }`}
          style={{ width: '126px', backgroundColor: 'transparent' }}
        >
          <span className="truncate inline-block max-w-full text-left">no label</span>
        </div>
      </div>

      {/* Label Options */}
      {labels.map((label, index) => {
        const rgb = hexToRgb(label.color);
        const lightBg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : label.color;
        const isSelected = currentLabelId === label.id;
        const itemIndex = index + 1; // +1 because "No Label" is index 0

        return (
          <div
            key={label.id}
            className="flex items-center gap-2"
            style={{
              opacity: isClosing ? 0 : isAnimatingIn ? 0 : 1,
              transform: isClosing ? 'translateY(-8px)' : isAnimatingIn ? 'translateY(-8px)' : 'translateY(0)',
              transition: `opacity ${isClosing ? '100ms' : '50ms'} ease-out ${getAnimationDelay(itemIndex)}ms, transform ${isClosing ? '100ms' : '50ms'} ease-out ${getAnimationDelay(itemIndex)}ms`,
            }}
          >
            <KeyBox hovered={false}>{index + 1}</KeyBox>
            <button
              onClick={() => onSelectLabel(label.id)}
              className={`border px-3 py-1 text-sm font-medium transition-opacity flex items-center justify-center min-w-0 ${
                isSelected ? "" : "opacity-60"
              } hover:opacity-100`}
              style={{
                backgroundColor: isSelected ? label.color : lightBg,
                borderColor: label.color,
                color: isSelected ? 'white' : label.color,
                width: '126px',
              }}
            >
              <span className="truncate inline-block max-w-full text-left">{label.name}</span>
            </button>
          </div>
        );
      })}

      {/* Add New Option */}
      {labels.length < 8 && (
        <div
          className="flex items-center gap-2 mt-3"
          style={{
            opacity: isClosing ? 0 : isAnimatingIn ? 0 : 1,
            transform: isClosing ? 'translateY(-8px)' : isAnimatingIn ? 'translateY(-8px)' : 'translateY(0)',
            transition: `opacity ${isClosing ? '100ms' : '50ms'} ease-out ${getAnimationDelay(labels.length + 1)}ms, transform ${isClosing ? '100ms' : '50ms'} ease-out ${getAnimationDelay(labels.length + 1)}ms`,
          }}
        >
          <KeyBox hovered={false}>N</KeyBox>
          <div
            className="border border-gray-300 px-3 py-1 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 flex items-center justify-center cursor-pointer transition-colors"
            style={{ width: '126px' }}
            onClick={onAddNew}
          >
            + new label
          </div>
        </div>
      )}
    </div>
  );
}
