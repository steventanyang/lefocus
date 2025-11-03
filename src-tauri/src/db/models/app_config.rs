//! App configuration data models.
//!
//! See system design documentation: phase-5-app-configs.md
//!
//! AppConfig stores custom logos and per-app settings (colors, etc.) for personalization.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub id: Option<String>,
    pub bundle_id: String,
    pub app_name: Option<String>,
    pub logo_data: Option<String>, // JSON-serialized LogoData
    pub color: Option<String>,
    pub created_at: String, // ISO 8601 datetime
    pub updated_at: String, // ISO 8601 datetime
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoData {
    pub view_box: String,
    pub paths: Vec<SvgPath>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SvgPath {
    pub d: String,
    pub stroke: String,
    pub stroke_width: f32,
    pub fill: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedApp {
    pub bundle_id: String,
    pub app_name: Option<String>,
    pub last_seen: DateTime<Utc>,
    pub total_readings: i64,
}

/// Validation functions for app config data
pub mod validation {
    use super::LogoData;
    use anyhow::{bail, Result};

    const MIN_STROKE_WIDTH: f32 = 1.0;
    const MAX_STROKE_WIDTH: f32 = 64.0;
    const MAX_PATH_LENGTH: usize = 10_000;
    const MAX_PATHS_PER_LOGO: usize = 1_000;
    const MAX_LOGO_JSON_SIZE: usize = 100_000; // 100 KB

    pub fn validate_color(color: &str) -> Result<()> {
        if !color.starts_with('#') {
            bail!("Invalid color format. Must be hex (#RRGGBB)");
        }

        let hex_part = &color[1..];
        if hex_part.len() != 6 && hex_part.len() != 8 {
            bail!("Invalid color format. Must be hex (#RRGGBB or #RRGGBBAA)");
        }

        if !hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
            bail!("Invalid color format. Must be hex (#RRGGBB)");
        }

        Ok(())
    }

    pub fn validate_stroke_width(width: f32) -> Result<()> {
        if width < 1.0 || width > 64.0 {
            bail!("Invalid stroke width. Must be between 1 and 64");
        }
        Ok(())
    }

    pub fn validate_path_data(path_d: &str) -> Result<()> {
        if path_d.len() > MAX_PATH_LENGTH {
            bail!("Path data too long (max 10,000 chars)");
        }

        // Basic SVG path syntax check (M, L, C, Q, Z commands)
        if !path_d
            .chars()
            .any(|c| matches!(c, 'M' | 'm' | 'L' | 'l' | 'C' | 'c' | 'Q' | 'q' | 'Z' | 'z'))
        {
            bail!("Invalid SVG path data");
        }

        Ok(())
    }

    pub fn validate_view_box(view_box: &str) -> Result<()> {
        let parts: Vec<&str> = view_box.split_whitespace().collect();
        if parts.len() != 4 {
            bail!("Invalid viewBox format");
        }

        // Parse dimensions
        let width: f64 = parts[2]
            .parse()
            .map_err(|_| anyhow::anyhow!("Invalid viewBox format"))?;
        let height: f64 = parts[3]
            .parse()
            .map_err(|_| anyhow::anyhow!("Invalid viewBox format"))?;

        if width <= 0.0 || height <= 0.0 {
            bail!("Invalid viewBox format");
        }

        if width > 512.0 || height > 512.0 {
            bail!("Invalid viewBox format");
        }

        Ok(())
    }

    pub fn validate_logo_data(logo_json: &str) -> Result<LogoData> {
        // Check JSON size
        if logo_json.len() > MAX_LOGO_JSON_SIZE {
            bail!("Logo data too large (max 100 KB)");
        }

        // Parse JSON
        let logo_data: LogoData =
            serde_json::from_str(logo_json).map_err(|_| anyhow::anyhow!("Invalid logo JSON"))?;

        // Validate viewBox
        validate_view_box(&logo_data.view_box)?;

        // Validate path count
        if logo_data.paths.len() > MAX_PATHS_PER_LOGO {
            bail!("Too many paths (max 1,000)");
        }

        // Validate each path
        for path in &logo_data.paths {
            validate_path_data(&path.d)?;
            validate_color(&path.stroke)?;
            validate_stroke_width(path.stroke_width)?;

            if let Some(fill) = &path.fill {
                validate_color(fill)?;
            }
        }

        Ok(logo_data)
    }
}
