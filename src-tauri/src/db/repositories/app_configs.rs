use anyhow::{bail, Result};
use chrono::Utc;
use rusqlite::{params, OptionalExtension, Row};

use crate::db::{
    connection::Database,
    helpers::parse_datetime,
    models::{app_config::validation, AppConfig, DetectedApp},
};

fn row_to_app_config(row: &Row) -> Result<AppConfig, rusqlite::Error> {
    Ok(AppConfig {
        id: Some(row.get("id")?),
        bundle_id: row.get("bundle_id")?,
        app_name: row.get("app_name")?,
        logo_data: row.get("logo_data")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_detected_app(row: &Row) -> Result<DetectedApp, rusqlite::Error> {
    let last_seen_str: String = row.get("last_seen")?;

    Ok(DetectedApp {
        bundle_id: row.get("bundle_id")?,
        app_name: row.get("app_name")?,
        last_seen: parse_datetime(&last_seen_str, "last_seen").map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                e.to_string(),
            )))
        })?,
        total_readings: row.get("total_readings")?,
    })
}

impl Database {
    /// Get app config by bundle_id
    pub async fn get_app_config(&self, bundle_id: String) -> Result<Option<AppConfig>> {
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, bundle_id, app_name, logo_data, color, created_at, updated_at
                 FROM app_configs
                 WHERE bundle_id = ?1",
            )?;

            let result = stmt
                .query_row(params![bundle_id], row_to_app_config)
                .optional()?;

            Ok(result)
        })
        .await
    }

    /// Get all app configs
    pub async fn get_all_app_configs(&self) -> Result<Vec<AppConfig>> {
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, bundle_id, app_name, logo_data, color, created_at, updated_at
                 FROM app_configs
                 ORDER BY updated_at DESC",
            )?;

            let configs = stmt
                .query_map([], row_to_app_config)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(configs)
        })
        .await
    }

    /// Insert or update app config
    pub async fn upsert_app_config(&self, mut config: AppConfig) -> Result<AppConfig> {
        // Validate bundle_id
        if config.bundle_id.is_empty() {
            bail!("bundle_id is required");
        }

        // Validate color if provided
        if let Some(color) = &config.color {
            validation::validate_color(color)?;
        }

        // Validate logo_data if provided
        if let Some(logo_json) = &config.logo_data {
            validation::validate_logo_data(logo_json)?;
        }

        let now = Utc::now().to_rfc3339();
        config.updated_at = now.clone();

        // If no created_at, set it now
        if config.created_at.is_empty() {
            config.created_at = now.clone();
        }

        self.execute(move |conn| {
            // Check if config already exists
            let existing_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM app_configs WHERE bundle_id = ?1",
                    params![config.bundle_id],
                    |row| row.get(0),
                )
                .optional()?;

            // Use existing ID if available, otherwise generate new one
            let id = if let Some(id) = existing_id {
                id
            } else if let Some(id) = config.id {
                id
            } else {
                format!("ac_{}", uuid::Uuid::new_v4())
            };

            conn.execute(
                "INSERT INTO app_configs (id, bundle_id, app_name, logo_data, color, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(bundle_id) DO UPDATE SET
                     app_name = excluded.app_name,
                     logo_data = excluded.logo_data,
                     color = excluded.color,
                     updated_at = excluded.updated_at",
                params![
                    id,
                    config.bundle_id,
                    config.app_name,
                    config.logo_data,
                    config.color,
                    config.created_at,
                    config.updated_at,
                ],
            )?;

            // Fetch the inserted/updated row to get the id
            let mut stmt = conn.prepare(
                "SELECT id, bundle_id, app_name, logo_data, color, created_at, updated_at
                 FROM app_configs
                 WHERE bundle_id = ?1",
            )?;

            let result = stmt.query_row(params![config.bundle_id], row_to_app_config)?;

            Ok(result)
        })
        .await
    }

    /// Delete app config by bundle_id
    pub async fn delete_app_config(&self, bundle_id: String) -> Result<()> {
        self.execute(move |conn| {
            conn.execute(
                "DELETE FROM app_configs WHERE bundle_id = ?1",
                params![bundle_id],
            )?;
            Ok(())
        })
        .await
    }

    /// Get all detected apps from context_readings (for settings page)
    /// Uses optimized query with segments table if available
    pub async fn get_all_detected_apps(&self) -> Result<Vec<DetectedApp>> {
        self.execute(move |conn| {
            // Try segments table first (faster, already aggregated)
            let segment_query = "
                SELECT DISTINCT
                    bundle_id,
                    app_name,
                    MAX(end_time) as last_seen,
                    COUNT(*) * 5 as total_readings
                FROM segments
                GROUP BY bundle_id, app_name
                ORDER BY last_seen DESC
            ";

            // Fallback to context_readings with simplified query
            let readings_query = "
                SELECT
                    bundle_id,
                    MAX(owner_name) as app_name,
                    MAX(timestamp) as last_seen,
                    COUNT(*) as total_readings
                FROM context_readings
                GROUP BY bundle_id
                ORDER BY last_seen DESC
            ";

            // Try segments first, fall back to context_readings
            let mut stmt = conn.prepare(segment_query)?;
            let apps = stmt
                .query_map([], row_to_detected_app)?
                .collect::<Result<Vec<_>, _>>()?;
            drop(stmt);

            if apps.is_empty() {
                // Try context_readings
                let mut stmt = conn.prepare(readings_query)?;
                let apps = stmt
                    .query_map([], row_to_detected_app)?
                    .collect::<Result<Vec<_>, _>>()?;
                drop(stmt);
                Ok(apps)
            } else {
                Ok(apps)
            }
        })
        .await
    }
}
