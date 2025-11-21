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
  const [modalMode, setModalMode] = useState<"create" | "edit">("edit");

  // Auto-select first label when labels are loaded
  useEffect(() => {
    if (!isLoading && labels.length > 0 && selectedIndex === null) {
      setSelectedIndex(0);
    }
  }, [isLoading, labels.length, selectedIndex]);

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

      // Number keys 1-8: Jump to label by index
      const num = parseInt(event.key);
      if (num >= 1 && num <= 8) {
        event.preventDefault();
        const labelIndex = num - 1;
        if (labelIndex < labels.length) {
          setSelectedIndex(labelIndex);
        }
        return;
      }

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

      // N key: Create new label (only if less than 8 labels)
      else if ((event.key === "n" || event.key === "N") && labels.length < 8) {
        event.preventDefault();
        setModalMode("create");
        setEditingLabel(null);
        setIsModalOpen(true);
      }

      // E key: Edit selected label
      else if ((event.key === "e" || event.key === "E") && selectedLabel) {
        event.preventDefault();
        setModalMode("edit");
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
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Labels</h2>
          <span className="text-sm text-gray-500">
            {labels.length} / 8
          </span>
        </div>
        <button
          onClick={() => {
            setModalMode("create");
            setEditingLabel(null);
            setIsModalOpen(true);
          }}
          disabled={labels.length >= 8}
          className="flex items-center gap-2 text-gray-600 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <KeyBox hovered={false}>N</KeyBox>
          <span className="text-sm">New Label</span>
        </button>
      </div>

      {/* Labels list - single column */}
      <div className="flex flex-col gap-3">
        {labels.map((label, index) => {
          const isSelected = selectedIndex === index;
          const isDeleteConfirm = deleteConfirmId === label.id;

          return (
            <div key={label.id} className="flex items-center gap-2" style={{ height: '34px' }}>
              {/* Shortcut number */}
              <KeyBox selected={isSelected} hovered={false} selectedColor={label.color}>
                {index + 1}
              </KeyBox>

              {/* Row container */}
              <div
                className="flex cursor-pointer"
                onClick={() => setSelectedIndex(index)}
              >
                {/* Label button - matching dropdown style */}
                {(() => {
                  const rgb = hexToRgb(label.color);
                  const lightBg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : label.color;
                  return (
                    <button
                      className={`border px-3 py-1 text-sm font-medium transition-opacity flex items-center justify-center min-w-0 ${
                        isSelected ? "" : "opacity-60"
                      } hover:opacity-100`}
                      style={{
                        backgroundColor: isSelected ? label.color : lightBg,
                        borderColor: label.color,
                        color: isSelected ? 'white' : label.color,
                        width: '126px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIndex(index);
                      }}
                    >
                      <span className="truncate inline-block max-w-full text-left">{label.name}</span>
                    </button>
                  );
                })()}

                {/* Actions container - only show when selected */}
                {isSelected && (
                  <div className="flex items-center justify-center px-2" style={{ minWidth: '200px' }}>
                    {isDeleteConfirm ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <KeyBox>D</KeyBox>
                        <span>to confirm</span>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalMode("edit");
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
                            // Mouse click: delete immediately without confirmation
                            deleteLabelMutation.mutate(label.id);
                            setSelectedIndex(null);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-red-600"
                        >
                          <KeyBox>D</KeyBox>
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Label Modal */}
      <LabelModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingLabel(null);
        }}
        mode={modalMode}
        existingLabel={editingLabel || undefined}
        existingLabels={labels}
      />
    </div>
  );
}
