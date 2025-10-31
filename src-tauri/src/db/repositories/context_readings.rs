use anyhow::{Context, Result};
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
                    ocr_word_count
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
                    ocr_word_count
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

                let timestamp = parse_datetime(&timestamp_str, "timestamp")
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))))?;
                let window_id_u32 = to_u64(window_id, "window_id")
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))))? as u32;
                let bounds: WindowBounds = from_str(&bounds_json)
                    .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))))?;

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
}
