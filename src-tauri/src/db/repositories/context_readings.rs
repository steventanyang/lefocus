use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::params;
use serde_json::{from_str, to_string};

use crate::db::{
    connection::Database,
    helpers::{parse_datetime, to_i64, to_u64},
    models::ContextReading,
};
use crate::macos_bridge::{WindowBounds, WindowMetadata};

impl Database {
    pub async fn insert_context_reading(&self, reading: &ContextReading) -> Result<()> {
        let record = reading.clone();
        self.execute(move |conn| {
            let window_id = to_i64(u64::from(record.window_metadata.window_id))?;
            let bounds_json = to_string(&record.window_metadata.bounds)
                .context("failed to serialize window bounds")?;
            let ocr_word_count = match record.ocr_word_count {
                Some(count) => Some(to_i64(count)?),
                None => None,
            };

            conn.execute(
                "INSERT INTO context_readings (
                    session_id,
                    timestamp,
                    window_id,
                    bundle_id,
                    window_title,
                    owner_name,
                    bounds_json,
                    phash,
                    ocr_text,
                    ocr_confidence,
                    ocr_word_count,
                    segment_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    record.session_id,
                    record.timestamp.to_rfc3339(),
                    window_id,
                    record.window_metadata.bundle_id,
                    record.window_metadata.title,
                    record.window_metadata.owner_name,
                    bounds_json,
                    record.phash,
                    record.ocr_text,
                    record.ocr_confidence,
                    ocr_word_count,
                    record.segment_id,
                ],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn get_context_readings_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<ContextReading>> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT 
                    id,
                    session_id,
                    timestamp,
                    window_id,
                    bundle_id,
                    window_title,
                    owner_name,
                    bounds_json,
                    phash,
                    ocr_text,
                    ocr_confidence,
                    ocr_word_count,
                    segment_id
                FROM context_readings
                WHERE session_id = ?1
                ORDER BY timestamp ASC",
            )?;

            let readings_iter = stmt.query_map(params![session_id], |row| {
                let id: Option<i64> = row.get(0)?;
                let session_id: String = row.get(1)?;
                let timestamp_str: String = row.get(2)?;
                let window_id: i64 = row.get(3)?;
                let bundle_id: String = row.get(4)?;
                let window_title: String = row.get(5)?;
                let owner_name: String = row.get(6)?;
                let bounds_json: String = row.get(7)?;
                let phash: Option<String> = row.get(8)?;
                let ocr_text: Option<String> = row.get(9)?;
                let ocr_confidence: Option<f64> = row.get(10)?;
                let ocr_word_count: Option<i64> = row.get(11)?;
                let segment_id: Option<String> = row.get(12)?;

                let timestamp = parse_datetime(&timestamp_str, "timestamp").map_err(|e| {
                    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        e.to_string(),
                    )))
                })?;
                let window_id_u32 = to_u64(window_id, "window_id").map_err(|e| {
                    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        e.to_string(),
                    )))
                })? as u32;
                let bounds: WindowBounds = from_str(&bounds_json).map_err(|e| {
                    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        e.to_string(),
                    )))
                })?;

                let window_metadata = WindowMetadata {
                    window_id: window_id_u32,
                    bundle_id,
                    title: window_title,
                    owner_name,
                    bounds,
                };

                Ok(ContextReading {
                    id,
                    session_id,
                    timestamp,
                    window_metadata,
                    phash,
                    ocr_text,
                    ocr_confidence,
                    ocr_word_count: ocr_word_count.map(|c| c as u64),
                    segment_id,
                })
            })?;

            let mut readings = Vec::new();
            for reading_result in readings_iter {
                readings.push(reading_result?);
            }

            Ok(readings)
        })
        .await
    }

    /// Update context_readings with their corresponding segment_id based on time range.
    /// Readings are matched to segments if their timestamp falls within [segment.start_time, segment.end_time].
    pub async fn update_readings_with_segment_ids(
        &self,
        session_id: &str,
        segments: &[(String, DateTime<Utc>, DateTime<Utc>)], // (segment_id, start_time, end_time)
    ) -> Result<()> {
        let session_id = session_id.to_string();
        let segments = segments.to_vec();
        self.execute(move |conn| {
            let tx = conn.transaction()?;

            for (segment_id, start_time, end_time) in &segments {
                tx.execute(
                    "UPDATE context_readings
                    SET segment_id = ?1
                    WHERE session_id = ?2
                    AND timestamp >= ?3
                    AND timestamp <= ?4
                    AND segment_id IS NULL",
                    params![
                        segment_id,
                        session_id,
                        start_time.to_rfc3339(),
                        end_time.to_rfc3339(),
                    ],
                )?;
            }

            tx.commit()?;
            Ok(())
        })
        .await
    }

    /// Get unique window titles for a specific segment with durations.
    /// Duration is calculated by counting readings per window title and multiplying by 5 seconds (reading interval).
    pub async fn get_unique_window_titles_for_segment(
        &self,
        segment_id: &str,
    ) -> Result<Vec<(String, i64)>> {
        const READING_INTERVAL_SECS: i64 = 5;
        let segment_id = segment_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT window_title, COUNT(*) as reading_count
                FROM context_readings
                WHERE segment_id = ?1
                AND window_title IS NOT NULL
                AND window_title != ''
                GROUP BY window_title
                ORDER BY reading_count DESC",
            )?;

            let titles_iter = stmt.query_map(params![segment_id], |row| {
                let title: String = row.get(0)?;
                let count: i64 = row.get(1)?;
                let duration_secs = count * READING_INTERVAL_SECS;
                Ok((title, duration_secs))
            })?;

            let mut titles = Vec::new();
            for title_result in titles_iter {
                titles.push(title_result?);
            }

            Ok(titles)
        })
        .await
    }
}
