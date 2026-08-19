use anyhow::{bail, Context, Result};
use rusqlite::{params, OptionalExtension};

use crate::db::{
    connection::Database,
    helpers::{parse_datetime, to_i64},
    models::{ActivityRun, ReadingArchive},
};

impl Database {
    pub async fn replace_activity_runs(
        &self,
        session_id: &str,
        runs: &[ActivityRun],
    ) -> Result<()> {
        let session_id = session_id.to_string();
        let runs = runs.to_vec();
        self.execute(move |conn| {
            let tx = conn.transaction()?;
            tx.execute(
                "DELETE FROM activity_runs WHERE session_id = ?1",
                params![session_id],
            )?;
            for run in runs {
                tx.execute(
                    "INSERT INTO activity_runs
                     (session_id, start_time, end_time, duration_secs, sample_count,
                      bundle_id, app_name, window_title)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        run.session_id,
                        run.start_time.to_rfc3339(),
                        run.end_time.to_rfc3339(),
                        run.duration_secs,
                        run.sample_count,
                        run.bundle_id,
                        run.app_name,
                        run.window_title,
                    ],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
    }

    pub async fn archive_candidates(&self, limit: usize) -> Result<Vec<String>> {
        self.execute(move |conn| {
            let mut statement = conn.prepare(
                "SELECT sessions.id
                 FROM sessions
                 WHERE sessions.status IN ('Completed', 'Interrupted', 'Cancelled')
                   AND EXISTS (
                       SELECT 1 FROM context_readings
                       WHERE context_readings.session_id = sessions.id
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM session_reading_archives
                       WHERE session_reading_archives.session_id = sessions.id
                   )
                 ORDER BY sessions.started_at ASC
                 LIMIT ?1",
            )?;
            let limit = i64::try_from(limit).context("archive candidate limit is too large")?;
            let rows = statement.query_map(params![limit], |row| row.get(0))?;
            rows.collect::<rusqlite::Result<Vec<String>>>()
                .map_err(Into::into)
        })
        .await
    }

    pub async fn archive_verified_readings(&self, archive: ReadingArchive) -> Result<()> {
        self.execute(move |conn| {
            let tx = conn.transaction()?;
            let raw_count: i64 = tx.query_row(
                "SELECT COUNT(*) FROM context_readings WHERE session_id = ?1",
                params![archive.session_id],
                |row| row.get(0),
            )?;
            let run_count: i64 = tx.query_row(
                "SELECT COALESCE(SUM(sample_count), 0)
                 FROM activity_runs WHERE session_id = ?1",
                params![archive.session_id],
                |row| row.get(0),
            )?;
            if raw_count != archive.reading_count || run_count != raw_count {
                bail!(
                    "archive precondition failed for {}: raw={}, runs={}, archive={}",
                    archive.session_id,
                    raw_count,
                    run_count,
                    archive.reading_count
                );
            }

            tx.execute(
                "INSERT INTO session_reading_archives
                 (session_id, format_version, reading_count, uncompressed_bytes,
                  checksum, compressed_data, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    archive.session_id,
                    archive.format_version,
                    archive.reading_count,
                    archive.uncompressed_bytes,
                    archive.checksum,
                    archive.compressed_data,
                    archive.created_at.to_rfc3339(),
                ],
            )?;
            tx.execute(
                "DELETE FROM context_readings WHERE session_id = ?1",
                params![archive.session_id],
            )?;
            tx.commit()?;
            Ok(())
        })
        .await
    }

    pub async fn get_reading_archive(&self, session_id: &str) -> Result<Option<ReadingArchive>> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            conn.query_row(
                "SELECT session_id, format_version, reading_count, uncompressed_bytes,
                        checksum, compressed_data, created_at
                 FROM session_reading_archives WHERE session_id = ?1",
                params![session_id],
                |row| {
                    let created_at: String = row.get(6)?;
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Vec<u8>>(5)?,
                        created_at,
                    ))
                },
            )
            .optional()?
            .map(|value| {
                Ok(ReadingArchive {
                    session_id: value.0,
                    format_version: value.1,
                    reading_count: value.2,
                    uncompressed_bytes: value.3,
                    checksum: value.4,
                    compressed_data: value.5,
                    created_at: parse_datetime(&value.6, "created_at")?,
                })
            })
            .transpose()
        })
        .await
    }

    pub async fn restore_context_readings(
        &self,
        session_id: &str,
        readings: &[crate::db::models::ContextReading],
    ) -> Result<()> {
        let session_id = session_id.to_string();
        let readings = readings.to_vec();
        self.execute(move |conn| {
            let tx = conn.transaction()?;
            tx.execute(
                "DELETE FROM context_readings WHERE session_id = ?1",
                params![session_id],
            )?;
            for reading in readings {
                let bounds_json = serde_json::to_string(&reading.window_metadata.bounds)?;
                tx.execute(
                    "INSERT INTO context_readings
                     (id, session_id, timestamp, window_id, bundle_id, window_title,
                      owner_name, bounds_json, phash, ocr_text, ocr_confidence,
                      ocr_word_count, segment_id)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    params![
                        reading.id,
                        reading.session_id,
                        reading.timestamp.to_rfc3339(),
                        to_i64(u64::from(reading.window_metadata.window_id))?,
                        reading.window_metadata.bundle_id,
                        reading.window_metadata.title,
                        reading.window_metadata.owner_name,
                        bounds_json,
                        reading.phash,
                        reading.ocr_text,
                        reading.ocr_confidence,
                        reading.ocr_word_count.map(to_i64).transpose()?,
                        reading.segment_id,
                    ],
                )?;
            }
            tx.commit()
                .context("failed to commit restored context readings")?;
            Ok(())
        })
        .await
    }

    pub async fn mark_legacy_vacuum_pending_if_complete(&self) -> Result<()> {
        self.execute(|conn| {
            let cutoff: Option<String> = conn
                .query_row(
                    "SELECT value FROM storage_maintenance
                     WHERE key = 'legacy_archive_cutoff'",
                    [],
                    |row| row.get(0),
                )
                .optional()?;
            let Some(cutoff) = cutoff else { return Ok(()) };
            let remaining: i64 = conn.query_row(
                "SELECT COUNT(DISTINCT sessions.id)
                 FROM sessions
                 INNER JOIN context_readings ON context_readings.session_id = sessions.id
                 WHERE sessions.started_at <= ?1
                   AND sessions.status IN ('Completed', 'Interrupted', 'Cancelled')
                   AND NOT EXISTS (
                       SELECT 1 FROM session_reading_archives
                       WHERE session_reading_archives.session_id = sessions.id
                   )",
                params![cutoff],
                |row| row.get(0),
            )?;
            if remaining == 0 {
                conn.execute(
                    "UPDATE storage_maintenance SET value = '1'
                     WHERE key = 'legacy_vacuum_pending'
                       AND (SELECT value FROM storage_maintenance
                            WHERE key = 'legacy_vacuum_done') = '0'",
                    [],
                )?;
            }
            Ok(())
        })
        .await
    }
}
