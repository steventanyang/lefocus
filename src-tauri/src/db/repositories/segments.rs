use anyhow::Result;
use rusqlite::{params, Row};
use std::collections::HashSet;

use crate::db::{
    connection::Database,
    helpers::parse_datetime,
    models::{Interruption, Segment, TopApp},
    repositories::apps::AppRepository,
};

fn row_to_segment(row: &Row) -> Result<Segment, rusqlite::Error> {
    let start_time_str: String = row.get("start_time")?;
    let end_time_str: String = row.get("end_time")?;

    Ok(Segment {
        id: row.get("id")?,
        session_id: row.get("session_id")?,
        start_time: parse_datetime(&start_time_str, "start_time")
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))))?,
        end_time: parse_datetime(&end_time_str, "end_time")
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))))?,
        duration_secs: row.get("duration_secs")?,
        bundle_id: row.get("bundle_id")?,
        app_name: row.get("app_name")?,
        window_title: row.get("window_title")?,
        confidence: row.get("confidence")?,
        duration_score: row.get("duration_score")?,
        stability_score: row.get("stability_score")?,
        visual_clarity_score: row.get("visual_clarity_score")?,
        ocr_quality_score: row.get("ocr_quality_score")?,
        reading_count: row.get("reading_count")?,
        unique_phash_count: row.get("unique_phash_count")?,
        segment_summary: row.get("segment_summary")?,
        icon_data_url: row.get("icon_data_url").ok(),
        icon_color: row.get("icon_color").ok(),
    })
}

fn row_to_interruption(row: &Row) -> Result<Interruption, rusqlite::Error> {
    let timestamp_str: String = row.get("timestamp")?;

    Ok(Interruption {
        id: row.get("id")?,
        segment_id: row.get("segment_id")?,
        bundle_id: row.get("bundle_id")?,
        app_name: row.get("app_name")?,
        timestamp: parse_datetime(&timestamp_str, "timestamp")
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))))?,
        duration_secs: row.get("duration_secs")?,
        icon_data_url: row.get("icon_data_url").ok(),
        icon_color: row.get("icon_color").ok(),
    })
}

/// Spawn a background task to fetch and store app icons for the given bundle IDs.
/// This is non-blocking - the function returns immediately after spawning the task.
fn spawn_icon_fetch_task(db: Database, bundle_ids: HashSet<String>) {
    if bundle_ids.is_empty() {
        return;
    }

    // Filter out synthetic bundle IDs that we know won't have icons
    let bundle_ids_to_fetch: Vec<String> = bundle_ids
        .into_iter()
        .filter(|bid| {
            // Skip synthetic system bundle ID
            if bid == "com.apple.system" {
                log::debug!("Skipping icon fetch for synthetic bundle ID: {}", bid);
                false
            } else {
                true
            }
        })
        .collect();

    if bundle_ids_to_fetch.is_empty() {
        return;
    }

    log::info!(
        "Fetching icons for {} apps at session end (apps that weren't pre-fetched during session)",
        bundle_ids_to_fetch.len()
    );

    tokio::spawn(async move {
        for bundle_id in bundle_ids_to_fetch {
            match crate::macos_bridge::get_app_icon_and_color(&bundle_id) {
                Some((icon_data_url, icon_color)) => {
                    let color_opt = if icon_color.is_empty() {
                        None
                    } else {
                        Some(icon_color.as_str())
                    };
                    if let Err(e) = db.update_app_icon(&bundle_id, &icon_data_url, color_opt).await {
                        log::warn!("Failed to store icon for {}: {}", bundle_id, e);
                    } else {
                        log::debug!("Stored icon and color for {}", bundle_id);
                    }
                }
                None => {
                    log::warn!("Failed to fetch icon for {}", bundle_id);
                }
            }
        }
    });
}

impl Database {
    /// Batch insert segments for a session.
    /// After segments are inserted, spawns background tasks to fetch missing app icons.
    // pub async fn insert_segments(
    //     &self,
    //     _session_id: &str,
    //     segments: &[Segment],
    // ) -> Result<()> {
    //     let segments = segments.to_vec();

    //     // Execute the database transaction and collect bundle IDs that need icons
    //     let bundles_missing_icons = self.execute(move |conn| {
    //         let tx = conn.transaction()?;
    //         let app_repo = AppRepository::new(&tx);
    //         let mut bundles_missing_icons = HashSet::new();

    //         for segment in &segments {
    //             // Ensure app exists in apps table
    //             app_repo.ensure_app_exists(
    //                 &segment.bundle_id,
    //                 segment.app_name.as_deref(),
    //             )?;

    //             // Insert segment
    //             tx.execute(
    //                 "INSERT INTO segments (
    //                     id,
    //                     session_id,
    //                     start_time,
    //                     end_time,
    //                     duration_secs,
    //                     bundle_id,
    //                     app_name,
    //                     window_title,
    //                     confidence,
    //                     duration_score,
    //                     stability_score,
    //                     visual_clarity_score,
    //                     ocr_quality_score,
    //                     reading_count,
    //                     unique_phash_count,
    //                     segment_summary
    //                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
    //                 params![
    //                     segment.id,
    //                     segment.session_id,
    //                     segment.start_time.to_rfc3339(),
    //                     segment.end_time.to_rfc3339(),
    //                     segment.duration_secs,
    //                     segment.bundle_id,
    //                     segment.app_name,
    //                     segment.window_title,
    //                     segment.confidence,
    //                     segment.duration_score,
    //                     segment.stability_score,
    //                     segment.visual_clarity_score,
    //                     segment.ocr_quality_score,
    //                     segment.reading_count,
    //                     segment.unique_phash_count,
    //                     segment.segment_summary,
    //                 ],
    //             )?;

    //             // Track apps with missing icons
    //             if let Some(app) = app_repo.get_app(&segment.bundle_id)? {
    //                 if app.icon_data_url.is_none() {
    //                     bundles_missing_icons.insert(segment.bundle_id.clone());
    //                 }
    //             }
    //         }

    //         tx.commit()?;
    //         Ok(bundles_missing_icons)
    //     })
    //     .await?;

    //     // Spawn background task to fetch missing icons
    //     spawn_icon_fetch_task(self.clone(), bundles_missing_icons);

    //     Ok(())
    // }

    // /// Batch insert interruptions for segments.
    // pub async fn insert_interruptions(
    //     &self,
    //     interruptions: &[Interruption],
    // ) -> Result<()> {
    //     let interruptions = interruptions.to_vec();
    //     self.execute(move |conn| {
    //         let tx = conn.transaction()?;

    //         for interruption in &interruptions {
    //             tx.execute(
    //                 "INSERT INTO interruptions (
    //                     id,
    //                     segment_id,
    //                     bundle_id,
    //                     app_name,
    //                     timestamp,
    //                     duration_secs
    //                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    //                 params![
    //                     interruption.id,
    //                     interruption.segment_id,
    //                     interruption.bundle_id,
    //                     interruption.app_name,
    //                     interruption.timestamp.to_rfc3339(),
    //                     interruption.duration_secs,
    //                 ],
    //             )?;
    //         }

    //         tx.commit()?;
    //         Ok(())
    //     })
    //     .await
    // }

    /// Atomically insert both segments and interruptions in a single transaction.
    /// This prevents race conditions where segments might be deleted before interruptions are inserted.
    pub async fn insert_segments_and_interruptions(
        &self,
        _session_id: &str,
        segments: &[Segment],
        interruptions: &[Interruption],
    ) -> Result<()> {
        let segments = segments.to_vec();
        let interruptions = interruptions.to_vec();

        // Execute both inserts in a single transaction
        let bundles_missing_icons = self.execute(move |conn| {
            let tx = conn.transaction()?;
            let app_repo = AppRepository::new(&tx);
            let mut bundles_missing_icons = HashSet::new();

            // Insert segments first
            for segment in &segments {
                // Ensure app exists in apps table
                app_repo.ensure_app_exists(
                    &segment.bundle_id,
                    segment.app_name.as_deref(),
                )?;

                // Insert segment
                tx.execute(
                    "INSERT INTO segments (
                        id,
                        session_id,
                        start_time,
                        end_time,
                        duration_secs,
                        bundle_id,
                        app_name,
                        window_title,
                        confidence,
                        duration_score,
                        stability_score,
                        visual_clarity_score,
                        ocr_quality_score,
                        reading_count,
                        unique_phash_count,
                        segment_summary
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                    params![
                        segment.id,
                        segment.session_id,
                        segment.start_time.to_rfc3339(),
                        segment.end_time.to_rfc3339(),
                        segment.duration_secs,
                        segment.bundle_id,
                        segment.app_name,
                        segment.window_title,
                        segment.confidence,
                        segment.duration_score,
                        segment.stability_score,
                        segment.visual_clarity_score,
                        segment.ocr_quality_score,
                        segment.reading_count,
                        segment.unique_phash_count,
                        segment.segment_summary,
                    ],
                )?;

                // Track apps with missing icons
                if let Some(app) = app_repo.get_app(&segment.bundle_id)? {
                    if app.icon_data_url.is_none() {
                        bundles_missing_icons.insert(segment.bundle_id.clone());
                    }
                }
            }

            // Insert interruptions (now guaranteed to have valid segment_id references)
            // First, collect all segment IDs to validate interruption references
            let segment_ids: std::collections::HashSet<String> = segments.iter()
                .map(|s| s.id.clone())
                .collect();
            
            let mut skipped_count = 0;
            for interruption in &interruptions {
                // Validate that the segment_id exists in the segments we're inserting
                if !segment_ids.contains(&interruption.segment_id) {
                    // Skip invalid interruption and log warning instead of failing entire transaction
                    // TODO: remove after validation
                    log::warn!(
                        "Skipping interruption {} - references segment_id {} which does not exist in segments being inserted",
                        interruption.id,
                        interruption.segment_id
                    );
                    skipped_count += 1;
                    continue;
                }
                
                tx.execute(
                    "INSERT INTO interruptions (
                        id,
                        segment_id,
                        bundle_id,
                        app_name,
                        timestamp,
                        duration_secs
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        interruption.id,
                        interruption.segment_id,
                        interruption.bundle_id,
                        interruption.app_name,
                        interruption.timestamp.to_rfc3339(),
                        interruption.duration_secs,
                    ],
                )?;
            }
            
            if skipped_count > 0 {
                log::warn!("Skipped {} invalid interruption(s) during insertion", skipped_count);
            }

            tx.commit()?;
            Ok(bundles_missing_icons)
        })
        .await?;

        // Spawn background task to fetch missing icons
        spawn_icon_fetch_task(self.clone(), bundles_missing_icons);

        Ok(())
    }

    /// Load all segments for a session, ordered by start_time.
    /// Includes icon data from the apps table via LEFT JOIN.
    pub async fn get_segments_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<Segment>> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT
                    segments.id,
                    segments.session_id,
                    segments.start_time,
                    segments.end_time,
                    segments.duration_secs,
                    segments.bundle_id,
                    segments.app_name,
                    segments.window_title,
                    segments.confidence,
                    segments.duration_score,
                    segments.stability_score,
                    segments.visual_clarity_score,
                    segments.ocr_quality_score,
                    segments.reading_count,
                    segments.unique_phash_count,
                    segments.segment_summary,
                    apps.icon_data_url,
                    apps.icon_color
                FROM segments
                LEFT JOIN apps ON segments.bundle_id = apps.bundle_id
                WHERE segments.session_id = ?1
                ORDER BY segments.start_time ASC",
            )?;

            let segments_iter = stmt.query_map(params![session_id], |row| {
                row_to_segment(row)
            })?;

            let mut segments = Vec::new();
            for segment_result in segments_iter {
                segments.push(segment_result?);
            }

            Ok(segments)
        })
        .await
    }

    /// Get interruptions for a specific segment.
    /// Includes icon data from the apps table via LEFT JOIN.
    pub async fn get_interruptions_for_segment(
        &self,
        segment_id: &str,
    ) -> Result<Vec<Interruption>> {
        let segment_id = segment_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT 
                    interruptions.id,
                    interruptions.segment_id,
                    interruptions.bundle_id,
                    interruptions.app_name,
                    interruptions.timestamp,
                    interruptions.duration_secs,
                    apps.icon_data_url,
                    apps.icon_color
                FROM interruptions
                LEFT JOIN apps ON interruptions.bundle_id = apps.bundle_id
                WHERE interruptions.segment_id = ?1
                ORDER BY interruptions.timestamp ASC",
            )?;

            let interruptions_iter = stmt.query_map(params![segment_id], |row| {
                row_to_interruption(row)
            })?;

            let mut interruptions = Vec::new();
            for interruption_result in interruptions_iter {
                interruptions.push(interruption_result?);
            }

            Ok(interruptions)
        })
        .await
    }

    /// Get top N apps for a session, aggregated by bundle_id with durations and percentages.
    pub async fn get_top_apps_for_session(
        &self,
        session_id: &str,
        limit: usize,
    ) -> Result<Vec<TopApp>> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            // First check if there are any segments
            let total_duration: i64 = conn.query_row(
                "SELECT COALESCE(SUM(duration_secs), 0) FROM segments WHERE session_id = ?1",
                params![&session_id],
                |row| row.get(0),
            )?;

            // If no segments, return empty vec
            if total_duration == 0 {
                return Ok(Vec::new());
            }

            let mut stmt = conn.prepare(
                "SELECT
                    bundle_id,
                    app_name,
                    SUM(duration_secs) as total_duration,
                    (SUM(duration_secs) * 100.0 / ?2) as percentage
                 FROM segments
                 WHERE session_id = ?1
                 GROUP BY bundle_id
                 ORDER BY total_duration DESC
                 LIMIT ?3",
            )?;

            let apps_iter = stmt.query_map(
                params![&session_id, total_duration, limit as i64],
                |row| {
                    Ok(TopApp {
                        bundle_id: row.get("bundle_id")?,
                        app_name: row.get("app_name")?,
                        duration_secs: row.get::<_, i64>("total_duration")? as u32,
                        percentage: row.get("percentage")?,
                    })
                },
            )?;

            let mut apps = Vec::new();
            for app_result in apps_iter {
                apps.push(app_result?);
            }

            Ok(apps)
        })
        .await
    }
}
