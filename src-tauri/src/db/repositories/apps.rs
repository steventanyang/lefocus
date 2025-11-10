//! App repository for managing app metadata and icons.
//!
//! See system design documentation: Phase 6 (phase-6-ux-apps-table.md)
//!
//! **Dependency Direction:**
//! - This module is a **leaf dependency** - it does NOT import from other repositories.
//! - Other repositories (e.g., `segments.rs`) may import `AppRepository` from this module.
//! - **DO NOT** import from `segments`, `sessions`, or `context_readings` here to avoid circular dependencies.

use crate::db::{connection::Database, models::App};
use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};

pub struct AppRepository<'a> {
    conn: &'a Connection,
}

impl<'a> AppRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// Ensure app exists in DB (upsert pattern)
    pub fn ensure_app_exists(&self, bundle_id: &str, app_name: Option<&str>) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        self.conn.execute(
            "INSERT INTO apps (id, bundle_id, app_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(bundle_id) DO UPDATE SET
                 app_name = COALESCE(excluded.app_name, apps.app_name),
                 updated_at = excluded.updated_at",
            params![id, bundle_id, app_name, now],
        )?;
        Ok(())
    }

    /// Get app metadata (including icon)
    pub fn get_app(&self, bundle_id: &str) -> Result<Option<App>> {
        self.conn
            .query_row(
                "SELECT id, bundle_id, app_name, icon_data_url, icon_color, icon_fetched_at
                 FROM apps WHERE bundle_id = ?1",
                params![bundle_id],
                |row| {
                    Ok(App {
                        id: row.get(0)?,
                        bundle_id: row.get(1)?,
                        app_name: row.get(2)?,
                        icon_data_url: row.get(3)?,
                        icon_color: row.get(4)?,
                        icon_fetched_at: row
                            .get::<_, Option<String>>(5)?
                            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                            .map(|dt| dt.with_timezone(&Utc)),
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    /// Update app icon and color
    pub fn update_icon(&self, bundle_id: &str, icon_data_url: &str, icon_color: Option<&str>) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE apps SET icon_data_url = ?1, icon_color = ?2, icon_fetched_at = ?3, updated_at = ?3
             WHERE bundle_id = ?4",
            params![icon_data_url, icon_color, now, bundle_id],
        )?;
        Ok(())
    }

    /// Check if app has an icon
    pub fn has_icon(&self, bundle_id: &str) -> Result<bool> {
        let result: Option<bool> = self
            .conn
            .query_row(
                "SELECT icon_data_url IS NOT NULL FROM apps WHERE bundle_id = ?1",
                params![bundle_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(result.unwrap_or(false))
    }

    /// Check if app has a color
    pub fn has_color(&self, bundle_id: &str) -> Result<bool> {
        let result: Option<bool> = self
            .conn
            .query_row(
                "SELECT icon_color IS NOT NULL AND icon_color != '' FROM apps WHERE bundle_id = ?1",
                params![bundle_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(result.unwrap_or(false))
    }

    // /// Get apps with missing icons (for background fetch)
    // /// Used for post-migration backfill: after schema_v7 migration backfills apps table
    // /// from existing segments, this finds apps without icons to fetch them.
    // pub fn get_apps_with_missing_icons(&self) -> Result<Vec<App>> {
    //     let mut stmt = self.conn.prepare(
    //         "SELECT id, bundle_id, app_name, icon_data_url, icon_fetched_at
    //          FROM apps
    //          WHERE icon_data_url IS NULL",
    //     )?;
    //
    //     let apps = stmt
    //         .query_map([], |row| {
    //             Ok(App {
    //                 id: row.get(0)?,
    //                 bundle_id: row.get(1)?,
    //                 app_name: row.get(2)?,
    //                 icon_data_url: row.get(3)?,
    //                 icon_fetched_at: row
    //                     .get::<_, Option<String>>(4)?
    //                     .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
    //                     .map(|dt| dt.with_timezone(&Utc)),
    //             })
    //         })?
    //         .collect::<Result<Vec<_>, _>>()?;
    //
    //     Ok(apps)
    // }
}

// Database async wrappers for app operations
impl Database {
    /// Ensure app exists in database
    pub async fn ensure_app_exists(&self, bundle_id: &str, app_name: Option<&str>) -> Result<()> {
        let bundle_id = bundle_id.to_string();
        let app_name = app_name.map(String::from);

        self.execute(move |conn| {
            let app_repo = AppRepository::new(conn);
            app_repo.ensure_app_exists(&bundle_id, app_name.as_deref())
        })
        .await
    }

    /// Check if app has an icon
    pub async fn app_has_icon(&self, bundle_id: &str) -> Result<bool> {
        let bundle_id = bundle_id.to_string();

        self.execute(move |conn| {
            let app_repo = AppRepository::new(conn);
            app_repo.has_icon(&bundle_id)
        })
        .await
    }

    /// Check if app has a color
    pub async fn app_has_color(&self, bundle_id: &str) -> Result<bool> {
        let bundle_id = bundle_id.to_string();

        self.execute(move |conn| {
            let app_repo = AppRepository::new(conn);
            app_repo.has_color(&bundle_id)
        })
        .await
    }

    /// Update app icon and color in database
    pub async fn update_app_icon(&self, bundle_id: &str, icon_data_url: &str, icon_color: Option<&str>) -> Result<()> {
        let bundle_id = bundle_id.to_string();
        let icon_data_url = icon_data_url.to_string();
        let icon_color = icon_color.map(String::from);

        self.execute(move |conn| {
            let app_repo = AppRepository::new(conn);
            app_repo.update_icon(&bundle_id, &icon_data_url, icon_color.as_deref())
        })
        .await
    }

    // TODO(Phase 7): Uncomment when implementing post-migration icon backfill
    // /// Get apps with missing icons
    // /// Used for post-migration backfill: after schema_v7 migration backfills apps table
    // /// from existing segments, this finds apps without icons to fetch them.
    // pub async fn get_apps_with_missing_icons(&self) -> Result<Vec<App>> {
    //     self.execute(move |conn| {
    //         let app_repo = AppRepository::new(conn);
    //         app_repo.get_apps_with_missing_icons()
    //     })
    //     .await
    // }

    /// Get app icons and colors for a list of bundle IDs
    /// Returns a HashMap of bundle_id -> (icon_data_url, icon_color)
    pub async fn get_app_icons_for_bundle_ids(
        &self,
        bundle_ids: &[String],
    ) -> Result<std::collections::HashMap<String, (Option<String>, Option<String>)>> {
        use std::collections::HashMap;
        let bundle_ids = bundle_ids.to_vec();

        self.execute(move |conn| {
            let mut app_icons = HashMap::new();

            // If no bundle IDs, return empty map
            if bundle_ids.is_empty() {
                return Ok(app_icons);
            }

            // Build parameterized query with placeholders
            let placeholders = bundle_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let query = format!(
                "SELECT bundle_id, icon_data_url, icon_color FROM apps WHERE bundle_id IN ({})",
                placeholders
            );

            let mut stmt = conn.prepare(&query)?;
            let params: Vec<&dyn rusqlite::ToSql> = bundle_ids
                .iter()
                .map(|id| id as &dyn rusqlite::ToSql)
                .collect();

            let mut rows = stmt.query(params.as_slice())?;
            while let Some(row) = rows.next()? {
                let bundle_id: String = row.get(0)?;
                let icon_data_url: Option<String> = row.get(1)?;
                let icon_color: Option<String> = row.get(2)?;
                app_icons.insert(bundle_id, (icon_data_url, icon_color));
            }

            // For bundle_ids not in the apps table, insert (None, None)
            for bundle_id in &bundle_ids {
                app_icons.entry(bundle_id.clone()).or_insert((None, None));
            }

            Ok(app_icons)
        })
        .await
    }
}
