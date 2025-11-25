export const FONT_OPTIONS = [
  { id: "noto-sans-jp", name: "Noto Sans JP", shortcut: "1", className: "font-noto-sans-jp" },
  { id: "helvetica", name: "Helvetica", shortcut: "2", className: "font-helvetica" },
  { id: "inter", name: "Inter", shortcut: "3", className: "font-inter" },
  { id: "work-sans", name: "Work Sans", shortcut: "4", className: "font-work-sans" },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", shortcut: "5", className: "font-ibm-plex-sans" },
  { id: "sf-pro", name: "SF Pro", shortcut: "6", className: "font-sf-pro" },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", shortcut: "7", className: "font-ibm-plex-mono" },
] as const;

export type FontId = typeof FONT_OPTIONS[number]["id"];

export const FONT_CLASSES: Record<string, string> = Object.fromEntries(
  FONT_OPTIONS.map(f => [f.id, f.className])
);
