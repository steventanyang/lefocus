import { useState, useEffect } from "react";
import { KeyBox } from "@/components/ui/KeyBox";

const fontOptions = [
  { id: "system", name: "System Default", shortcut: "1", className: "" },
  { id: "sans", name: "Sans Serif", shortcut: "2", className: "font-sans" },
  { id: "serif", name: "Serif", shortcut: "3", className: "font-serif" },
  { id: "mono", name: "Monospace", shortcut: "4", className: "font-mono" },
  { id: "medium", name: "Medium Weight", shortcut: "5", className: "font-medium" },
  { id: "light", name: "Light Weight", shortcut: "6", className: "font-light" },
];

export function FontsSettingsPage() {
  const [selectedFont, setSelectedFont] = useState("system");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Apply font to root element when selection changes
  useEffect(() => {
    const root = document.documentElement;
    
    // Clean up all font and weight classes
    const allClasses = ["font-sans", "font-serif", "font-mono", "font-medium", "font-light"];
    allClasses.forEach(cls => root.classList.remove(cls));
    
    // Apply new font class if not system default
    if (selectedFont !== "system") {
      const fontOption = fontOptions.find(f => f.id === selectedFont);
      if (fontOption && fontOption.className) {
        fontOption.className.split(" ").forEach(cls => root.classList.add(cls));
      }
    }
    
    // Save preference to localStorage
    localStorage.setItem("selectedFont", selectedFont);
  }, [selectedFont]);

  // Load font preference on mount and set selected index
  useEffect(() => {
    const savedFont = localStorage.getItem("selectedFont");
    if (savedFont && fontOptions.some(f => f.id === savedFont)) {
      setSelectedFont(savedFont);
      const index = fontOptions.findIndex(f => f.id === savedFont);
      if (index !== -1) {
        setSelectedIndex(index);
      }
    } else {
      // Default to first option if no saved preference
      setSelectedIndex(0);
    }
  }, []);

  // Keyboard shortcuts for font selection and navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the key corresponds to a font shortcut (1-6)
      const keyNum = event.key;
      if (keyNum >= "1" && keyNum <= "6") {
        event.preventDefault();
        const fontIndex = parseInt(keyNum) - 1;
        if (fontIndex < fontOptions.length) {
          setSelectedFont(fontOptions[fontIndex].id);
          setSelectedIndex(fontIndex);
        }
        return;
      }

      // Up/Down arrow keys for navigation
      if (event.key === "ArrowUp" && selectedIndex !== null && selectedIndex > 0) {
        event.preventDefault();
        const newIndex = selectedIndex - 1;
        setSelectedIndex(newIndex);
        setSelectedFont(fontOptions[newIndex].id);
        return;
      }

      if (event.key === "ArrowDown" && selectedIndex !== null && selectedIndex < fontOptions.length - 1) {
        event.preventDefault();
        const newIndex = selectedIndex + 1;
        setSelectedIndex(newIndex);
        setSelectedFont(fontOptions[newIndex].id);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Fonts</h2>
        {/* New Font button - matching labels page style */}
        <button
          className="text-sm font-light text-gray-600 flex items-center gap-2"
        >
          <KeyBox hovered={false}>N</KeyBox>
          <span className="text-sm">New Font</span>
        </button>
      </div>

      {/* Fonts list - single column matching labels page */}
      <div className="flex flex-col gap-3">
        {fontOptions.map((font, index) => {
          const isSelected = selectedIndex === index;

          return (
            <div key={font.id} className="flex items-center gap-2" style={{ height: '34px' }}>
              {/* Shortcut number */}
              <KeyBox selected={isSelected} hovered={false}>
                {font.shortcut}
              </KeyBox>

              {/* Font button */}
              <button
                className={`border px-3 py-1 text-sm font-medium transition-opacity flex items-center justify-center min-w-0 ${
                  isSelected ? "" : "opacity-60"
                } hover:opacity-100 font-normal`}
                style={{
                  backgroundColor: isSelected ? "#000000" : "#f9fafb",
                  borderColor: isSelected ? "#000000" : "#d1d5db",
                  color: isSelected ? 'white' : '#000000',
                  width: '126px',
                }}
                onClick={() => {
                  setSelectedFont(font.id);
                  setSelectedIndex(index);
                }}
              >
                <span className="truncate inline-block max-w-full text-left">{font.name}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
