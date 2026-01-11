import { useRef, useEffect } from "react";
import { KeyBox } from "@/components/ui/KeyBox";

interface NoteSectionProps {
  noteText: string;
  isOnNote: boolean;
  isEditingNote: boolean;
  onNoteChange: (text: string) => void;
  onSetIsOnNote: (isOn: boolean) => void;
  onSetIsEditingNote: (isEditing: boolean) => void;
  onSave: () => void;
}

export function NoteSection({
  noteText,
  isOnNote,
  isEditingNote,
  onNoteChange,
  onSetIsOnNote,
  onSetIsEditingNote,
  onSave,
}: NoteSectionProps) {
  const noteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingNote && noteInputRef.current) {
      noteInputRef.current.focus();
      noteInputRef.current.setSelectionRange(noteText.length, noteText.length);
    }
  }, [isEditingNote, noteText.length]);

  const handleClick = () => {
    onSetIsOnNote(true);
    onSetIsEditingNote(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-normal tracking-wide text-gray-800">
        note
      </h3>
      <div style={{ minHeight: "20px" }}>
        {isEditingNote ? (
          <input
            ref={noteInputRef}
            type="text"
            value={noteText}
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={() => {
              if (noteText.trim() === "") {
                onSetIsEditingNote(false);
              }
              onSave();
            }}
            onKeyDown={(e) => {
              // Handle Cmd+navigation shortcuts (a, t, s, p, 1-4)
              if ((e.metaKey || e.ctrlKey) && ["a", "t", "s", "p", "1", "2", "3", "4"].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                onSave();
                onSetIsEditingNote(false);
                onSetIsOnNote(false);
                setTimeout(() => {
                  window.dispatchEvent(new KeyboardEvent("keydown", {
                    key: e.key,
                    metaKey: e.metaKey,
                    ctrlKey: e.ctrlKey,
                    bubbles: true,
                  }));
                }, 0);
              }
            }}
            className="w-full text-base font-normal border-none outline-none bg-white p-0 m-0 block"
            style={{ caretColor: "black", height: "20px", lineHeight: "20px" }}
            placeholder=""
          />
        ) : noteText.trim() ? (
          <button
            onClick={handleClick}
            className={`block w-full text-left text-base font-normal ${isOnNote ? "bg-gray-100" : ""}`}
            style={{ lineHeight: "20px" }}
          >
            {noteText}
          </button>
        ) : (
          <button onClick={handleClick} style={{ height: "20px", display: "block" }}>
            <KeyBox selected={isOnNote}>N</KeyBox>
          </button>
        )}
      </div>
    </div>
  );
}
