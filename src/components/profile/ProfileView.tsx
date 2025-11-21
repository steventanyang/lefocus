import { useState, useEffect } from "react";
import { LabelsSettingsPage } from "./LabelsSettingsPage";
import { FontsSettingsPage } from "./FontsSettingsPage";
import { IslandSettingsPage } from "./IslandSettingsPage";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping } from "@/utils/keyboardUtils";

type ViewName = "timer" | "activities" | "stats" | "profile";

interface ProfileViewProps {
  onClose: () => void;
  onNavigate?: (view: ViewName) => void;
}

type SubPage = "labels" | "fonts" | "island";

export function ProfileView({ onClose }: ProfileViewProps) {
  const [selectedSubPage, setSelectedSubPage] = useState<SubPage>("labels");

  // Keyboard shortcuts for sidebar navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isUserTyping()) return;

      // L key: Switch to Labels
      if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        setSelectedSubPage("labels");
        return;
      }

      // F key: Switch to Fonts (only if not Cmd/Ctrl+F for browser search)
      const isModifierPressed = event.metaKey || event.ctrlKey;
      if ((event.key === "f" || event.key === "F") && !isModifierPressed) {
        event.preventDefault();
        setSelectedSubPage("fonts");
        return;
      }

      // C key: Switch to Completion chime settings
      if ((event.key === "c" || event.key === "C") && !isModifierPressed) {
        event.preventDefault();
        setSelectedSubPage("island");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="w-full max-w-4xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">Profile</h1>
        <button
          onClick={onClose}
          className="text-base font-light text-gray-600 flex items-center gap-2 hover:text-black"
        >
          <KeyboardShortcut keyLetter="t" />
          <span>View Timer</span>
        </button>
      </div>

      {/* Content area with sidebar */}
      <div className="flex gap-8">
        {/* Left sidebar navigation */}
        <div className="w-48 flex flex-col gap-1">
          <button
            onClick={() => setSelectedSubPage("labels")}
            className="flex items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-white"
          >
            <KeyBox
              selected={selectedSubPage === "labels"}
              hovered={false}
            >
              L
            </KeyBox>
            <span className={selectedSubPage === "labels" ? "font-medium text-black" : "text-gray-600"}>
              Labels
            </span>
          </button>
          <button
            onClick={() => setSelectedSubPage("fonts")}
            className="flex items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-white"
          >
            <KeyBox
              selected={selectedSubPage === "fonts"}
              hovered={false}
            >
              F
            </KeyBox>
            <span className={selectedSubPage === "fonts" ? "font-medium text-black" : "text-gray-600"}>
              Fonts
            </span>
          </button>
          <button
            onClick={() => setSelectedSubPage("island")}
            className="flex items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-white"
          >
            <KeyBox
              selected={selectedSubPage === "island"}
              hovered={false}
            >
              C
            </KeyBox>
            <span className={selectedSubPage === "island" ? "font-medium text-black" : "text-gray-600"}>
              Chimes
            </span>
          </button>
        </div>

        {/* Right content area */}
        <div className="flex-1">
          {selectedSubPage === "labels" && <LabelsSettingsPage />}
          {selectedSubPage === "fonts" && <FontsSettingsPage />}
          {selectedSubPage === "island" && <IslandSettingsPage />}
        </div>
      </div>
    </div>
  );
}
