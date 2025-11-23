import { useState, useEffect } from "react";
import { KeyBox } from "@/components/ui/KeyBox";

const fontOptions = [
  { id: "noto-sans-jp", name: "Noto Sans JP", shortcut: "1", className: "font-noto-sans-jp" },
  { id: "helvetica", name: "Helvetica", shortcut: "2", className: "font-helvetica" },
  { id: "inter", name: "Inter", shortcut: "3", className: "font-inter" },
  { id: "work-sans", name: "Work Sans", shortcut: "4", className: "font-work-sans" },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", shortcut: "5", className: "font-ibm-plex-sans" },
  { id: "sf-pro", name: "SF Pro", shortcut: "6", className: "font-sf-pro" },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", shortcut: "7", className: "font-ibm-plex-mono" },
];

export function FontsSettingsPage() {
  const [selectedFont, setSelectedFont] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load font preference on mount and detect current font
  useEffect(() => {
    const root = document.documentElement;
    const savedFont = localStorage.getItem("selectedFont");
    
    // Migrate old "system" preference to "noto-sans-jp"
    if (savedFont === "system") {
      localStorage.setItem("selectedFont", "noto-sans-jp");
      setSelectedFont("noto-sans-jp");
      setSelectedIndex(0);
      setIsInitialized(true);
      return;
    }
    
    // Check what font is currently applied to the root element
    const currentFontClass = fontOptions.find(font => {
      if (!font.className) return false;
      return font.className.split(" ").some(cls => root.classList.contains(cls));
    });
    
    if (currentFontClass) {
      // Use the currently applied font
      setSelectedFont(currentFontClass.id);
      const index = fontOptions.findIndex(f => f.id === currentFontClass.id);
      setSelectedIndex(index !== -1 ? index : 0);
    } else if (savedFont && fontOptions.some(f => f.id === savedFont)) {
      // Fallback to saved preference if no font class is applied
      setSelectedFont(savedFont);
      const index = fontOptions.findIndex(f => f.id === savedFont);
      setSelectedIndex(index !== -1 ? index : 0);
    } else {
      // Default to first option (Noto Sans JP)
      setSelectedFont("noto-sans-jp");
      setSelectedIndex(0);
    }
    setIsInitialized(true);
  }, []);

  // Apply font to root element when selection changes (only after initialization)
  useEffect(() => {
    if (!isInitialized || selectedFont === null) return;
    
    const root = document.documentElement;
    
    // Clean up all font classes
    const allClasses = [
      "font-sans", "font-serif", "font-mono", "font-medium", "font-light",
      "font-noto-sans-jp", "font-helvetica", "font-inter", "font-work-sans",
      "font-ibm-plex-sans", "font-sf-pro", "font-ibm-plex-mono"
    ];
    allClasses.forEach(cls => root.classList.remove(cls));
    
    // Apply new font class
    const fontOption = fontOptions.find(f => f.id === selectedFont);
    if (fontOption && fontOption.className) {
      fontOption.className.split(" ").forEach(cls => root.classList.add(cls));
    }
    
    // Save preference to localStorage
    localStorage.setItem("selectedFont", selectedFont);
  }, [selectedFont, isInitialized]);

  // Keyboard shortcuts for font selection and navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the key corresponds to a font shortcut (1-7)
      const key = event.key;
      if (key >= "1" && key <= "7") {
        event.preventDefault();
        const fontIndex = parseInt(key) - 1;
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
        <h2 className="text-lg font-normal">fonts</h2>
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
                  width: '160px',
                }}
                onClick={() => {
                  setSelectedFont(font.id);
                  setSelectedIndex(index);
                }}
              >
                <span className={`truncate inline-block max-w-full text-left ${font.className}`}>
                  {font.name}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
