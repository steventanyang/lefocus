import { useEffect, useRef } from "react";
import type { Label } from "@/types/label";
import { KeyBox } from "@/components/ui/KeyBox";
import { useLabelModal, PRESET_COLORS } from "@/hooks/useLabelModal";

interface LabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  existingLabel?: Label;
  autoAssignToSessionId?: string;
  existingLabels: Label[];
  onLabelCreated?: (labelId: number) => void;
}

export function LabelModal({
  isOpen,
  onClose,
  mode,
  existingLabel,
  autoAssignToSessionId,
  existingLabels,
  onLabelCreated,
}: LabelModalProps) {
  const {
    step,
    setStep,
    name,
    setName,
    setSelectedColor,
    selectedColorIndex,
    setSelectedColorIndex,
    error,
    handleNameSubmit,
    handleColorSubmit,
    isSubmitting,
  } = useLabelModal({
    isOpen,
    mode,
    existingLabel,
    autoAssignToSessionId,
    existingLabels,
    onClose,
    onLabelCreated,
  });

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input when step is "name"
  useEffect(() => {
    if (isOpen && step === "name" && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen, step]);

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
              placeholder="new label name"
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
                  cancel
                </button>
              </div>
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-16 h-6 px-2 py-1" hovered={false}>return</KeyBox>
                <button
                  onClick={handleNameSubmit}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
                >
                  next
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
                  back
                </button>
              </div>
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-16 h-6 px-2 py-1" hovered={false}>return</KeyBox>
                <button
                  onClick={handleColorSubmit}
                  disabled={isSubmitting}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black"
                >
                  {isSubmitting ? "saving..." : "save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
