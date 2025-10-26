use anyhow::{Context, Result};
use rusqlite::params;
use serde_json::to_string;

use crate::db::{connection::Database, helpers::to_i64, models::ContextReading};

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
}
