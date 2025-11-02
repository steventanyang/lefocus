use anyhow::Result;
use rusqlite::{params, Row};

use crate::db::{
    connection::Database,
    helpers::parse_datetime,
    models::{Interruption, Segment},
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
    })
}

impl Database {
    /// Batch insert segments for a session.
    pub async fn insert_segments(
        &self,
        _session_id: &str,
        segments: &[Segment],
    ) -> Result<()> {
        let segments = segments.to_vec();
        self.execute(move |conn| {
            let tx = conn.transaction()?;

            for segment in &segments {
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
            }

            tx.commit()?;
            Ok(())
        })
        .await
    }

    /// Batch insert interruptions for segments.
    pub async fn insert_interruptions(
        &self,
        interruptions: &[Interruption],
    ) -> Result<()> {
        let interruptions = interruptions.to_vec();
        self.execute(move |conn| {
            let tx = conn.transaction()?;

            for interruption in &interruptions {
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

            tx.commit()?;
            Ok(())
        })
        .await
    }

    /// Load all segments for a session, ordered by start_time.
    pub async fn get_segments_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<Segment>> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT
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
                FROM segments
                WHERE session_id = ?1
                ORDER BY start_time ASC",
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
    pub async fn get_interruptions_for_segment(
        &self,
        segment_id: &str,
    ) -> Result<Vec<Interruption>> {
        let segment_id = segment_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT 
                    id,
                    segment_id,
                    bundle_id,
                    app_name,
                    timestamp,
                    duration_secs
                FROM interruptions
                WHERE segment_id = ?1
                ORDER BY timestamp ASC",
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
}
