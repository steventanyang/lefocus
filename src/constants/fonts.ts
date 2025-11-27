export const FONT_OPTIONS = [
  { id: "ibm-plex-sans", name: "IBM Plex Sans", shortcut: "1", className: "font-ibm-plex-sans" },
  { id: "helvetica", name: "Helvetica", shortcut: "2", className: "font-helvetica" },
  { id: "inter", name: "Inter", shortcut: "3", className: "font-inter" },
  { id: "sf-pro", name: "SF Pro", shortcut: "4", className: "font-sf-pro" },
  { id: "work-sans", name: "Work Sans", shortcut: "5", className: "font-work-sans" },
  { id: "roboto", name: "Roboto", shortcut: "6", className: "font-roboto" },
  { id: "source-sans", name: "Source Sans 3", shortcut: "7", className: "font-source-sans" },
] as const;

export type FontId = typeof FONT_OPTIONS[number]["id"];

export const FONT_CLASSES: Record<string, string> = Object.fromEntries(
  FONT_OPTIONS.map(f => [f.id, f.className])
);
