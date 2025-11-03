// App configuration type definitions matching Rust backend
// See system design: phase-5-app-configs.md

export interface AppConfig {
  id?: string; // Database ID (UUID string, undefined for new configs)
  bundleId: string; // Stable app identifier
  appName?: string; // Display name, optional
  logoData?: string; // JSON-serialized LogoData
  color?: string; // Hex color
  createdAt: string; // ISO 8601 datetime string
  updatedAt: string; // ISO 8601 datetime string
}

export interface LogoData {
  viewBox: string;
  paths: SvgPath[];
}

export interface SvgPath {
  d: string; // SVG path data
  stroke: string; // Hex color
  strokeWidth: number;
  fill?: string; // Optional fill (not supported in v1, reserved for future)
}

// Transient type used only in LogoSketchModal for editing with undo/redo
export interface EditableSvgPath extends SvgPath {
  id: number; // Unique ID for undo/redo tracking, NOT persisted to database
}

export interface DetectedApp {
  bundleId: string;
  appName?: string; // Most common app_name for this bundle_id
  lastSeen: string; // ISO 8601 datetime (serialized from Rust DateTime<Utc>)
  totalReadings: number; // Count of readings for this app
}

