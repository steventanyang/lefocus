import { useState, useEffect } from "react";
import { useLabelsQuery, useDeleteLabelMutation } from "@/hooks/queries";
import { LabelModal } from "@/components/labels/LabelModal";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping } from "@/utils/keyboardUtils";
import type { Label } from "@/types/label";

export function LabelsSettingsPage() {
  const { data: labels = [], isLoading } = useLabelsQuery();
  const deleteLabelMutation = useDeleteLabelMutation();

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Reset deleteConfirmId after timeout
  useEffect(() => {
    if (deleteConfirmId !== null) {
      const timeout = setTimeout(() => {
        setDeleteConfirmId(null);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [deleteConfirmId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isUserTyping() || isModalOpen) return;

      const selectedLabel = selectedIndex !== null ? labels[selectedIndex] : null;

      // Arrow keys: navigate list
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return labels.length > 0 ? 0 : null;
          return Math.max(0, prev - 1);
        });
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) return labels.length > 0 ? 0 : null;
          return Math.min(labels.length - 1, (prev || 0) + 1);
        });
      }

      // E key: Edit selected label
      else if ((event.key === "e" || event.key === "E") && selectedLabel) {
        event.preventDefault();
        setEditingLabel(selectedLabel);
        setIsModalOpen(true);
      }

      // D key: Delete selected label (double-press confirmation)
      else if ((event.key === "d" || event.key === "D") && selectedLabel) {
        event.preventDefault();
        if (deleteConfirmId === selectedLabel.id) {
          // Second press: actually delete
          deleteLabelMutation.mutate(selectedLabel.id);
          setDeleteConfirmId(null);
          setSelectedIndex(null);
        } else {
          // First press: show confirmation
          setDeleteConfirmId(selectedLabel.id);
        }
      }

      // Esc: Cancel delete confirmation
      else if (event.key === "Escape" && deleteConfirmId !== null) {
        event.preventDefault();
        setDeleteConfirmId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [labels, selectedIndex, deleteConfirmId, isModalOpen, deleteLabelMutation]);

  if (isLoading) {
    return <div className="text-gray-500">Loading labels...</div>;
  }

  if (labels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-gray-500">
        <p>No labels created yet</p>
        <p className="text-sm">Create labels to categorize your focus sessions</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Labels</h2>
        <p className="text-sm text-gray-500">
          {labels.length} / 9 labels
        </p>
      </div>

      {/* Labels list */}
      <div className="flex flex-col gap-2">
        {labels.map((label, index) => (
          <div
            key={label.id}
            className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
              selectedIndex === index
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:bg-gray-50"
            } ${deleteConfirmId === label.id ? "bg-red-50 border-red-300" : ""}`}
            onClick={() => setSelectedIndex(index)}
          >
            <div className="flex items-center gap-3">
              {/* Color indicator */}
              <div
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: label.color }}
              />

              {/* Label name */}
              <span className="font-medium">{label.name}</span>

              {/* Shortcut number */}
              <span className="text-xs text-gray-400 font-mono ml-2">
                {index + 1}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {selectedIndex === index && (
                <>
                  {deleteConfirmId === label.id ? (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <KeyBox>D</KeyBox>
                      <span>to confirm</span>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingLabel(label);
                          setIsModalOpen(true);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-black"
                      >
                        <KeyBox>E</KeyBox>
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(label.id);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-red-600"
                      >
                        <KeyBox>D</KeyBox>
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Keyboard hints */}
      <div className="mt-6 p-4 bg-gray-50 rounded-md text-sm text-gray-600">
        <p className="font-medium mb-2">Keyboard Shortcuts:</p>
        <ul className="space-y-1">
          <li>↑↓ - Navigate labels</li>
          <li>E - Edit selected label</li>
          <li>D (twice) - Delete selected label</li>
        </ul>
      </div>

      {/* Edit Label Modal */}
      <LabelModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingLabel(null);
        }}
        mode="edit"
        existingLabel={editingLabel || undefined}
      />
    </div>
  );
}
