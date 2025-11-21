import { useState, useEffect } from "react";
import { LabelsSettingsPage } from "./LabelsSettingsPage";
import { TestSettingsPage } from "./TestSettingsPage";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping } from "@/utils/keyboardUtils";

type ViewName = "timer" | "activities" | "stats" | "profile";

interface ProfileViewProps {
  onClose: () => void;
  onNavigate?: (view: ViewName) => void;
}

type SubPage = "labels" | "test";

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

      // T key: Switch to Test (only if not Cmd/Ctrl+T for timer navigation)
      const isModifierPressed = event.metaKey || event.ctrlKey;
      if ((event.key === "t" || event.key === "T") && !isModifierPressed) {
        event.preventDefault();
        setSelectedSubPage("test");
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
        <div className="w-48 flex flex-col gap-2">
          <button
            onClick={() => setSelectedSubPage("labels")}
            className="flex items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-gray-50"
          >
            <KeyBox
              selected={selectedSubPage === "labels"}
              hovered={false}
            >
              L
            </KeyBox>
            <span className={selectedSubPage === "labels" ? "font-semibold text-black" : "text-gray-600"}>
              Labels
            </span>
          </button>
          <button
            onClick={() => setSelectedSubPage("test")}
            className="flex items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-gray-50"
          >
            <KeyBox
              selected={selectedSubPage === "test"}
              hovered={false}
            >
              T
            </KeyBox>
            <span className={selectedSubPage === "test" ? "font-semibold text-black" : "text-gray-600"}>
              Test
            </span>
          </button>
        </div>

        {/* Right content area */}
        <div className="flex-1">
          {selectedSubPage === "labels" && <LabelsSettingsPage />}
          {selectedSubPage === "test" && <TestSettingsPage />}
        </div>
      </div>
    </div>
  );
}
