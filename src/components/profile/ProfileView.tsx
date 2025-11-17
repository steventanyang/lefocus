import { useState } from "react";
import { LabelsSettingsPage } from "./LabelsSettingsPage";
import { KeyboardShortcut } from "@/components/ui/KeyboardShortcut";

interface ProfileViewProps {
  onNavigate: (view: "timer" | "activities" | "stats" | "profile") => void;
  onClose: () => void;
}

type SubPage = "labels";

export function ProfileView({ onNavigate, onClose }: ProfileViewProps) {
  const [selectedSubPage, setSelectedSubPage] = useState<SubPage>("labels");

  return (
    <div className="w-full max-w-4xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <button
          onClick={onClose}
          className="text-base font-light text-gray-600 flex items-center gap-2 hover:text-black"
        >
          <KeyboardShortcut keyLetter="p" />
          <span>Close</span>
        </button>
      </div>

      {/* Content area with sidebar */}
      <div className="flex gap-8">
        {/* Left sidebar navigation */}
        <div className="w-48 flex flex-col gap-2">
          <button
            onClick={() => setSelectedSubPage("labels")}
            className={`px-4 py-2 text-left rounded-md transition-colors ${
              selectedSubPage === "labels"
                ? "bg-gray-100 font-medium"
                : "hover:bg-gray-50"
            }`}
          >
            Labels
          </button>
          {/* Future sub-pages can be added here */}
        </div>

        {/* Right content area */}
        <div className="flex-1">
          {selectedSubPage === "labels" && <LabelsSettingsPage />}
        </div>
      </div>
    </div>
  );
}
