import { useState, useEffect, useCallback, useRef } from "react";
import { useCreateLabelMutation, useUpdateLabelMutation, useUpdateSessionLabelMutation } from "@/hooks/queries";
import type { Label } from "@/types/label";

// 4x4 grid of preset colors (16 colors) - balanced warm row plus two rows of cool blues/greens
export const PRESET_COLORS = [
  "#592C34", // deep cranberry
  "#6B3145", // berry wine
  "#763A5E", // muted magenta
  "#81446F", // dusky plum
  "#8F4D36", // ember clay
  "#9C5A33", // burnt copper
  "#B0743D", // amber ochre
  "#BFA04A", // muted goldenrod
  "#4E6A4A", // moss green
  "#4A7A5F", // pine sage
  "#3F7F70", // deep teal
  "#3B7A82", // teal blue
  "#366F92", // steel blue
  "#3C639C", // twilight blue
  "#4458A0", // muted indigo
  "#4F5A90", // dusk periwinkle
];

type Step = "name" | "color";

interface UseLabelModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  existingLabel?: Label;
  autoAssignToSessionId?: string;
  existingLabels: Label[];
  onClose: () => void;
  onLabelCreated?: (labelId: number) => void;
}

export function useLabelModal({
  isOpen,
  mode,
  existingLabel,
  autoAssignToSessionId,
  existingLabels,
  onClose,
  onLabelCreated,
}: UseLabelModalProps) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

        // Notify parent component of the newly created label
        if (onLabelCreated) {
          onLabelCreated(newLabel.id);
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
  }, [mode, name, selectedColor, autoAssignToSessionId, existingLabel, createLabelMutation, updateLabelMutation, updateSessionLabelMutation, onClose, onLabelCreated]);

  const navigateColorGrid = useCallback((direction: "up" | "down" | "left" | "right") => {
    setSelectedColorIndex(prev => {
      let newIndex = prev;

      switch (direction) {
        case "up": {
          const currentRow = Math.floor(prev / 4);
          if (currentRow > 0) {
            newIndex = prev - 4;
          }
          break;
        }
        case "down": {
          const currentRow = Math.floor(prev / 4);
          if (currentRow < 3) {
            newIndex = prev + 4;
          }
          break;
        }
        case "left": {
          const currentCol = prev % 4;
          if (currentCol > 0) {
            newIndex = prev - 1;
          }
          break;
        }
        case "right": {
          const currentCol = prev % 4;
          if (currentCol < 3) {
            newIndex = prev + 1;
          }
          break;
        }
      }

      if (newIndex !== prev) {
        setSelectedColor(PRESET_COLORS[newIndex]);
      }
      return newIndex;
    });
  }, []);

  // Use refs to store the latest handlers to avoid recreating the keydown listener
  const handleNameSubmitRef = useRef(handleNameSubmit);
  const handleColorSubmitRef = useRef(handleColorSubmit);
  const navigateColorGridRef = useRef(navigateColorGrid);

  useEffect(() => {
    handleNameSubmitRef.current = handleNameSubmit;
    handleColorSubmitRef.current = handleColorSubmit;
    navigateColorGridRef.current = navigateColorGrid;
  }, [handleNameSubmit, handleColorSubmit, navigateColorGrid]);

  // Register keyboard event listener
  useEffect(() => {
    if (!isOpen) return;

    const stopEvent = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Step 1: Name input
      if (step === "name") {
        if (event.key === "Enter") {
          stopEvent(event);
          handleNameSubmitRef.current();
          return;
        } else if (event.key === "Escape") {
          stopEvent(event);
          onClose();
          return;
        }
      }

      // Step 2: Color picker
      else if (step === "color") {
        // Arrow keys: navigate color grid
        if (event.key === "ArrowUp") {
          stopEvent(event);
          navigateColorGridRef.current("up");
          return;
        }

        if (event.key === "ArrowDown") {
          stopEvent(event);
          navigateColorGridRef.current("down");
          return;
        }

        if (event.key === "ArrowLeft") {
          stopEvent(event);
          navigateColorGridRef.current("left");
          return;
        }

        if (event.key === "ArrowRight") {
          stopEvent(event);
          navigateColorGridRef.current("right");
          return;
        }

        // Delete/Backspace: go back to name step
        if (event.key === "Backspace" || event.key === "Delete") {
          stopEvent(event);
          setStep("name");
          return;
        }

        // Enter: save label
        if (event.key === "Enter") {
          stopEvent(event);
          handleColorSubmitRef.current();
          return;
        }
      }
    };

    // Use capture phase to catch events before other handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, step]);

  return {
    step,
    setStep,
    name,
    setName,
    selectedColor,
    setSelectedColor,
    selectedColorIndex,
    setSelectedColorIndex,
    error,
    handleNameSubmit,
    handleColorSubmit,
    isSubmitting: createLabelMutation.isPending || updateLabelMutation.isPending,
  };
}
