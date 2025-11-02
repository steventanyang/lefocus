/**
 * App-specific color mappings with matte, toned-down Japanese aesthetic
 * Colors are softer, less saturated versions inspired by traditional Japanese palettes
 */

export const APP_COLORS: Record<string, string> = {
  // Development & Code Editors
  "com.todesktop.230313mzl4w4u92": "#2C2C2C", // Cursor - matte black
  "com.microsoft.VSCode": "#4A5F7A", // VS Code - muted slate blue
  "com.sublimetext.4": "#5B6D7A", // Sublime - soft steel
  "com.jetbrains.intellij": "#6B5B73", // IntelliJ - dusty purple
  "com.apple.dt.Xcode": "#5F7A8A", // Xcode - soft blue-gray
  "com.github.atom": "#6B8E7A", // Atom - sage green

  // Browsers
  "com.google.Chrome": "#7A8C9E", // Chrome - muted blue-gray
  "com.apple.Safari": "#6B9EB5", // Safari - soft teal
  "org.mozilla.firefox": "#9E7A5F", // Firefox - burnt sienna
  "com.brave.Browser": "#B5735F", // Brave - terracotta
  "company.thebrowser.Browser": "#8A7A9E", // Arc - muted lavender

  // Communication
  "com.slack.Slack": "#8A5F7A", // Slack - dusty plum
  "com.tinyspeck.slackmacgap": "#8A5F7A", // Slack (legacy) - dusty plum
  "com.hnc.Discord": "#5F6B8A", // Discord - slate blue
  "us.zoom.xos": "#6B8AA0", // Zoom - soft periwinkle
  "com.microsoft.teams": "#7A6B9E", // Teams - muted purple
  "com.apple.MobileSMS": "#7AA085", // Messages - sage green

  // Media & Entertainment
  "com.spotify.client": "#4A6B5F", // Spotify - forest green (toned down)
  "com.apple.Music": "#B56B7A", // Apple Music - dusty rose
  "com.apple.TV": "#6B6B6B", // Apple TV - charcoal
  "com.youtube.desktop": "#9E6B5F", // YouTube - clay red
  "com.netflix.Netflix": "#8A5F5F", // Netflix - brick red

  // Productivity
  "notion.id": "#8A8A7A", // Notion - warm gray
  "md.obsidian": "#6B5B8A", // Obsidian - deep purple
  "com.figma.Desktop": "#8A6B8A", // Figma - mauve
  "com.adobe.illustrator": "#9E7A4A", // Illustrator - ochre
  "com.adobe.photoshop": "#5F7A9E", // Photoshop - steel blue

  // Terminals
  "com.apple.Terminal": "#3C3C3C", // Terminal - dark charcoal
  "com.googlecode.iterm2": "#4A4A4A", // iTerm2 - graphite
  "co.zeit.hyper": "#5F5F5F", // Hyper - warm gray
  "com.github.wez.wezterm": "#6B6B5F", // WezTerm - olive gray

  // Other
  "com.postmanlabs.mac": "#9E8A6B", // Postman - sandy brown
  "com.docker.docker": "#5F7A8A", // Docker - ocean blue
};

/**
 * Get color for a given bundle ID
 * Falls back to confidence-based color if no specific color defined
 */
export function getAppColor(bundleId: string, confidence?: number): string {
  // Check if we have a specific color for this app
  if (bundleId in APP_COLORS) {
    return APP_COLORS[bundleId];
  }

  // Fallback to confidence-based colors if provided
  if (confidence !== undefined) {
    return getConfidenceColor(confidence);
  }

  // Default fallback - neutral gray
  return "#7A7A7A";
}

/**
 * Confidence-based colors (matte Japanese aesthetic)
 * Used as fallback for unknown apps
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "#6B8E7A"; // Muted jade green - focused
  if (confidence >= 0.4) return "#B59E6B"; // Soft gold - mixed
  return "#B57A6B"; // Dusty coral - unclear
}

/**
 * Get confidence label for UI display
 */
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "Focused";
  if (confidence >= 0.4) return "Mixed";
  return "Unclear";
}
