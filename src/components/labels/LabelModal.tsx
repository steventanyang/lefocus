import { useState, useEffect, useRef, useCallback } from "react";
import { useCreateLabelMutation, useUpdateLabelMutation, useUpdateSessionLabelMutation } from "@/hooks/queries";
import type { Label } from "@/types/label";
import { isUserTyping } from "@/utils/keyboardUtils";
import { KeyBox } from "@/components/ui/KeyBox";

// 4x4 grid of preset colors (16 colors) - muted, darker, grey-toned palette
const PRESET_COLORS = [
  "#6B5B5F", // dusty mauve
  "#7A5F5B", // terracotta grey
  "#8A6B5F", // warm clay
  "#9E8A73", // sandy taupe
  "#5F6B5F", // sage grey
  "#5B7A6B", // forest grey
  "#6B8A7A", // muted jade
  "#5F8A8A", // teal grey
  "#5F7A8A", // slate blue
  "#5B6B8A", // periwinkle grey
  "#6B5F8A", // dusty purple
  "#7A5F8A", // mauve grey
  "#8A5F7A", // plum grey
  "#8A5F6B", // rose grey
  "#7A6B6B", // warm stone
  "#6B6B7A", // cool stone
];

type Step = "name" | "color";

interface LabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  existingLabel?: Label;
  autoAssignToSessionId?: string;
  existingLabels: Label[];
}

export function LabelModal({
  isOpen,
  onClose,
  mode,
  existingLabel,
  autoAssignToSessionId,
  existingLabels,
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

  const handleNameSubmit = useCallback(() => {
    if (!name.trim()) {
      setError("Label name cannot be empty");
      return;
    }

    // Check for duplicate label names (case-insensitive)
    const trimmedName = name.trim().toLowerCase();
    const isDuplicate = existingLabels.some(label => {
      // In edit mode, allow the same name if it's the current label being edited
      if (mode === "edit" && existingLabel && label.id === existingLabel.id) {
        return false;
      }
      return label.name.toLowerCase() === trimmedName;
    });

    if (isDuplicate) {
      setError("A label with this name already exists");
      return;
    }

    setError(null);
    setStep("color");
  }, [name, existingLabels, mode, existingLabel]);

  const handleColorSubmit = useCallback(async () => {
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
  }, [mode, name, selectedColor, autoAssignToSessionId, existingLabel, createLabelMutation, updateLabelMutation, updateSessionLabelMutation, onClose]);

  // Handle keyboard shortcuts - synchronizing with keyboard events (external system)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Step 1: Name input
      if (step === "name") {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          handleNameSubmit();
          return;
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
      }

      // Step 2: Color picker
      else if (step === "color") {
        // Arrow keys: navigate color grid
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          setSelectedColorIndex(prev => {
            const currentRow = Math.floor(prev / 4);
            if (currentRow > 0) {
              const newIndex = prev - 4;
              setSelectedColor(PRESET_COLORS[newIndex]);
              return newIndex;
            }
            return prev;
          });
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          setSelectedColorIndex(prev => {
            const currentRow = Math.floor(prev / 4);
            if (currentRow < 3) {
              const newIndex = prev + 4;
              setSelectedColor(PRESET_COLORS[newIndex]);
              return newIndex;
            }
            return prev;
          });
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          setSelectedColorIndex(prev => {
            const currentCol = prev % 4;
            if (currentCol > 0) {
              const newIndex = prev - 1;
              setSelectedColor(PRESET_COLORS[newIndex]);
              return newIndex;
            }
            return prev;
          });
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          setSelectedColorIndex(prev => {
            const currentCol = prev % 4;
            if (currentCol < 3) {
              const newIndex = prev + 1;
              setSelectedColor(PRESET_COLORS[newIndex]);
              return newIndex;
            }
            return prev;
          });
          return;
        }

        // Delete/Backspace: go back to name step
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          event.stopPropagation();
          setStep("name");
          return;
        }

        // Enter: save label
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          handleColorSubmit();
          return;
        }
      }
    };

    // Use capture phase to catch events before other handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, step, handleNameSubmit, handleColorSubmit, onClose, selectedColorIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white shadow-xl p-8 w-96">
        {/* Step 1: Name Input */}
        {step === "name" && (
          <div>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-3xl font-semibold focus:outline-none placeholder-gray-400"
              placeholder="New label name"
              maxLength={50}
            />
            {/* Error banner with fixed height */}
            <div className="mt-6 h-12">
              {error && (
                <div className="bg-red-50 text-red-800 px-4 py-3 text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-4">
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-12 h-6 py-1" hovered={false}>esc</KeyBox>
                <button
                  onClick={onClose}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-16 h-6 px-2 py-1" hovered={false}>return</KeyBox>
                <button
                  onClick={handleNameSubmit}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Color Picker */}
        {step === "color" && (
          <div>
            <div className="mb-6">
              <span className="text-3xl font-semibold">{name}</span>
            </div>

            {/* 4x4 Color Grid */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              {PRESET_COLORS.map((color, index) => (
                <button
                  key={color}
                  onClick={() => {
                    setSelectedColor(color);
                    setSelectedColorIndex(index);
                  }}
                  className={`w-full h-10 transition-all ${
                    selectedColorIndex === index
                      ? "ring-2 ring-offset-2"
                      : ""
                  }`}
                  style={{
                    backgroundColor: color,
                    ...(selectedColorIndex === index && { '--tw-ring-color': color } as any)
                  }}
                />
              ))}
            </div>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            <div className="flex gap-4">
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-16 h-6 px-2 py-1" hovered={false}>delete</KeyBox>
                <button
                  onClick={() => setStep("name")}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
                >
                  Back
                </button>
              </div>
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-16 h-6 px-2 py-1" hovered={false}>return</KeyBox>
                <button
                  onClick={handleColorSubmit}
                  disabled={createLabelMutation.isPending || updateLabelMutation.isPending}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black"
                >
                  {createLabelMutation.isPending || updateLabelMutation.isPending
                    ? "Saving..."
                    : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
