export const FONT_OPTIONS = [
  {
    id: "ibm-plex-sans",
    name: "ibm plex sans",
    shortcut: "1",
    className: "font-ibm-plex-sans",
  },
  {
    id: "helvetica",
    name: "helvetica",
    shortcut: "2",
    className: "font-helvetica",
  },
  { id: "inter", name: "inter", shortcut: "3", className: "font-inter" },
  { id: "sf-pro", name: "sf pro", shortcut: "4", className: "font-sf-pro" },
  {
    id: "work-sans",
    name: "work sans",
    shortcut: "5",
    className: "font-work-sans",
  },
  { id: "roboto", name: "roboto", shortcut: "6", className: "font-roboto" },
  {
    id: "source-sans",
    name: "source sans 3",
    shortcut: "7",
    className: "font-source-sans",
  },
] as const;

export type FontId = (typeof FONT_OPTIONS)[number]["id"];

export const FONT_CLASSES: Record<string, string> = Object.fromEntries(
  FONT_OPTIONS.map((f) => [f.id, f.className])
);
