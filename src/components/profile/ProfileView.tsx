import { useState, useEffect } from "react";
import { LabelsSettingsPage } from "./LabelsSettingsPage";
import { FontsSettingsPage } from "./FontsSettingsPage";
import { ChimeSettingsPage } from "./IslandSettingsPage";
import { SettingsSettingsPage } from "./SettingsSettingsPage";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping } from "@/utils/keyboardUtils";

type ViewName = "timer" | "activities" | "stats" | "profile";

interface ProfileViewProps {
  onClose: () => void;
  onNavigate?: (view: ViewName) => void;
}

type SubPage = "labels" | "fonts" | "island" | "settings";

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

      // S key: Switch to Settings
      if ((event.key === "s" || event.key === "S") && !isModifierPressed) {
        event.preventDefault();
        setSelectedSubPage("settings");
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
        <h1 className="text-2xl font-light tracking-wide">profile</h1>
        <button
          onClick={onClose}
          className="text-base font-light text-gray-600 flex items-center gap-2 group"
        >
          <KeyboardShortcut keyLetter="t" hovered={false} />
          <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">view timer</span>
        </button>
      </div>

      {/* Content area with sidebar */}
      <div className="flex gap-8">
        {/* Left sidebar navigation */}
        <div className="flex flex-col gap-2 min-w-[120px]">
          <button
            onClick={() => setSelectedSubPage("labels")}
            className="text-base font-light text-gray-600 flex items-center gap-2 group text-left"
          >
            <KeyBox
              selected={selectedSubPage === "labels"}
              hovered={false}
            >
              L
            </KeyBox>
            <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">
              labels
            </span>
          </button>
          <button
            onClick={() => setSelectedSubPage("fonts")}
            className="text-base font-light text-gray-600 flex items-center gap-2 group text-left"
          >
            <KeyBox
              selected={selectedSubPage === "fonts"}
              hovered={false}
            >
              F
            </KeyBox>
            <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">
              fonts
            </span>
          </button>
          <button
            onClick={() => setSelectedSubPage("island")}
            className="text-base font-light text-gray-600 flex items-center gap-2 group text-left"
          >
            <KeyBox
              selected={selectedSubPage === "island"}
              hovered={false}
            >
              C
            </KeyBox>
            <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">
              chimes
            </span>
          </button>
          <button
            onClick={() => setSelectedSubPage("settings")}
            className="text-base font-light text-gray-600 flex items-center gap-2 group text-left"
          >
            <KeyBox
              selected={selectedSubPage === "settings"}
              hovered={false}
            >
              S
            </KeyBox>
            <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">
              settings
            </span>
          </button>
        </div>

        {/* Right content area */}
        <div className="flex-1">
          {selectedSubPage === "labels" && <LabelsSettingsPage />}
          {selectedSubPage === "fonts" && <FontsSettingsPage />}
          {selectedSubPage === "island" && <ChimeSettingsPage />}
          {selectedSubPage === "settings" && <SettingsSettingsPage />}
        </div>
      </div>
    </div>
  );
}
