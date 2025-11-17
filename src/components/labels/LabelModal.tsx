import { useState, useEffect, useRef } from "react";
import { useCreateLabelMutation, useUpdateLabelMutation, useUpdateSessionLabelMutation } from "@/hooks/queries";
import type { Label } from "@/types/label";
import { isUserTyping } from "@/utils/keyboardUtils";

// 4x4 grid of preset colors (16 colors)
const PRESET_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#10B981", "#14B8A6",
  "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899",
];

type Step = "name" | "color";

interface LabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  existingLabel?: Label;
  autoAssignToSessionId?: string;
}

export function LabelModal({
  isOpen,
  onClose,
  mode,
  existingLabel,
  autoAssignToSessionId,
}: LabelModalProps) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const createLabelMutation = useCreateLabelMutation();
  const updateLabelMutation = useUpdateLabelMutation();
  const updateSessionLabelMutation = useUpdateSessionLabelMutation();

  // Initialize form when modal opens or mode/existingLabel changes
  useEffect(() => {
    if (isOpen) {
      setStep("name");
      setError(null);

      if (mode === "edit" && existingLabel) {
        setName(existingLabel.name);
        const colorIndex = PRESET_COLORS.indexOf(existingLabel.color);
        setSelectedColorIndex(colorIndex >= 0 ? colorIndex : 0);
        setSelectedColor(colorIndex >= 0 ? existingLabel.color : PRESET_COLORS[0]);
      } else {
        setName("");
        setSelectedColor(PRESET_COLORS[0]);
        setSelectedColorIndex(0);
      }
    }
  }, [isOpen, mode, existingLabel]);

  // Auto-focus name input when step is "name"
  useEffect(() => {
    if (isOpen && step === "name" && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen, step]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Step 1: Name input
      if (step === "name") {
        // Don't prevent default for typing in input
        if (event.key === "Enter") {
          event.preventDefault();
          handleNameSubmit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }

      // Step 2: Color picker
      else if (step === "color") {
        // Ignore if user is typing (shouldn't happen but safety check)
        if (isUserTyping()) return;

        // Arrow keys: navigate color grid
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          const row = Math.floor(selectedColorIndex / 4);
          const col = selectedColorIndex % 4;

          let newRow = row;
          let newCol = col;

          if (event.key === "ArrowUp") newRow = Math.max(0, row - 1);
          if (event.key === "ArrowDown") newRow = Math.min(3, row + 1);
          if (event.key === "ArrowLeft") newCol = Math.max(0, col - 1);
          if (event.key === "ArrowRight") newCol = Math.min(3, col + 1);

          const newIndex = newRow * 4 + newCol;
          setSelectedColorIndex(newIndex);
          setSelectedColor(PRESET_COLORS[newIndex]);
        }

        // Enter or Escape: save label
        else if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          handleColorSubmit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, step, name, selectedColor, selectedColorIndex, onClose]);

  const handleNameSubmit = () => {
    if (!name.trim()) {
      setError("Label name cannot be empty");
      return;
    }
    setError(null);
    setStep("color");
  };

  const handleColorSubmit = async () => {
    try {
      if (mode === "create") {
        // Create new label
        const newLabel = await createLabelMutation.mutateAsync({
          name: name.trim(),
          color: selectedColor,
        });

        // If autoAssignToSessionId is provided, assign the new label to that session
        if (autoAssignToSessionId) {
          await updateSessionLabelMutation.mutateAsync({
            sessionId: autoAssignToSessionId,
            labelId: newLabel.id,
          });
        }
      } else if (mode === "edit" && existingLabel) {
        // Update existing label
        await updateLabelMutation.mutateAsync({
          labelId: existingLabel.id,
          name: name.trim(),
          color: selectedColor,
        });
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save label");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <h2 className="text-xl font-semibold mb-4">
          {mode === "create" ? "Create New Label" : "Edit Label"}
        </h2>

        {/* Step 1: Name Input */}
        {step === "name" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Label Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleNameSubmit();
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter label name"
              maxLength={50}
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="flex justify-between mt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleNameSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Next
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Press <span className="font-mono font-semibold">Enter</span> to continue,{" "}
              <span className="font-mono font-semibold">Esc</span> to cancel
            </p>
          </div>
        )}

        {/* Step 2: Color Picker */}
        {step === "color" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Color
            </label>
            <div className="mb-4">
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-md">
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: selectedColor }}
                />
                <span className="font-medium">{name}</span>
              </div>
            </div>

            {/* 4x4 Color Grid */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {PRESET_COLORS.map((color, index) => (
                <button
                  key={color}
                  onClick={() => {
                    setSelectedColor(color);
                    setSelectedColorIndex(index);
                  }}
                  className={`w-full h-12 rounded-md transition-all ${
                    selectedColorIndex === index
                      ? "ring-2 ring-blue-500 ring-offset-2 scale-105"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

            <div className="flex justify-between">
              <button
                onClick={() => setStep("name")}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Back
              </button>
              <button
                onClick={handleColorSubmit}
                disabled={createLabelMutation.isPending || updateLabelMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {createLabelMutation.isPending || updateLabelMutation.isPending
                  ? "Saving..."
                  : "Save"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Use arrow keys to navigate,{" "}
              <span className="font-mono font-semibold">Enter</span> or{" "}
              <span className="font-mono font-semibold">Esc</span> to save
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
