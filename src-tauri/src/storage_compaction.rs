use std::io::{Cursor, Read};

use anyhow::{anyhow, bail, Context, Result};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    db::{
        models::{ActivityRun, ReadingArchive},
        ContextReading, Database,
    },
    segmentation::{segment_session, SegmentationConfig},
};

const ARCHIVE_FORMAT_VERSION: i64 = 1;
const ZSTD_LEVEL: i32 = 9;
const CAPTURE_INTERVAL_SECS: i64 = 5;
const RUN_GAP_SECS: i64 = 10;
const MAX_RESTORE_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
struct ArchiveEnvelope {
    format_version: i64,
    readings: Vec<ContextReading>,
}

pub fn generate_activity_runs(mut readings: Vec<ContextReading>) -> Vec<ActivityRun> {
    readings.sort_by_key(|reading| (reading.timestamp, reading.id));
    let mut runs = Vec::new();
    let Some(first) = readings.first().cloned() else {
        return runs;
    };

    let mut start = first.timestamp;
    let mut previous = first.clone();
    let mut count = 1_i64;

    let push_run = |runs: &mut Vec<ActivityRun>,
                    first: &ContextReading,
                    last: &ContextReading,
                    run_start,
                    count| {
        let end = last.timestamp + Duration::seconds(CAPTURE_INTERVAL_SECS);
        runs.push(ActivityRun {
            session_id: first.session_id.clone(),
            start_time: run_start,
            end_time: end,
            duration_secs: (end - run_start).num_seconds().max(0),
            sample_count: count,
            bundle_id: first.window_metadata.bundle_id.clone(),
            app_name: (!first.window_metadata.owner_name.is_empty())
                .then(|| first.window_metadata.owner_name.clone()),
            window_title: normalize_title(&first.window_metadata.title),
        });
    };

    let mut run_first = first;
    for reading in readings.into_iter().skip(1) {
        let split = reading.session_id != run_first.session_id
            || reading.window_metadata.bundle_id != run_first.window_metadata.bundle_id
            || normalize_title(&reading.window_metadata.title)
                != normalize_title(&run_first.window_metadata.title)
            || reading.segment_id != previous.segment_id
            || (reading.timestamp - previous.timestamp).num_seconds() > RUN_GAP_SECS;
        if split {
            push_run(&mut runs, &run_first, &previous, start, count);
            start = reading.timestamp;
            run_first = reading.clone();
            count = 1;
        } else {
            count += 1;
        }
        previous = reading;
    }
    push_run(&mut runs, &run_first, &previous, start, count);
    runs
}

fn normalize_title(title: &str) -> Option<String> {
    (!title.is_empty()).then(|| title.to_string())
}

pub async fn generate_and_store_runs(db: &Database, session_id: &str) -> Result<usize> {
    let readings = db.get_context_readings_for_session(session_id).await?;
    let runs = generate_activity_runs(readings);
    db.replace_activity_runs(session_id, &runs).await?;
    Ok(runs.len())
}

async fn ensure_segments_and_runs(db: &Database, session_id: &str) -> Result<Vec<ContextReading>> {
    let mut readings = db.get_context_readings_for_session(session_id).await?;
    if readings.is_empty() {
        bail!("session {session_id} has no raw readings");
    }

    if readings.iter().any(|reading| reading.segment_id.is_none()) {
        let (segments, interruptions) = segment_session(readings, &SegmentationConfig::default())?;
        db.insert_segments_and_interruptions(session_id, &segments, &interruptions)
            .await?;
        let ranges = segments
            .iter()
            .map(|segment| (segment.id.clone(), segment.start_time, segment.end_time))
            .collect::<Vec<_>>();
        db.update_readings_with_segment_ids(session_id, &ranges)
            .await?;
        readings = db.get_context_readings_for_session(session_id).await?;
        if readings.iter().any(|reading| reading.segment_id.is_none()) {
            bail!("segmentation backfill left unassigned readings for {session_id}");
        }
    }

    let runs = generate_activity_runs(readings.clone());
    let run_samples: i64 = runs.iter().map(|run| run.sample_count).sum();
    if run_samples != readings.len() as i64 {
        bail!("run verification failed for {session_id}");
    }
    db.replace_activity_runs(session_id, &runs).await?;
    Ok(readings)
}

fn checksum(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn build_archive(session_id: String, mut readings: Vec<ContextReading>) -> Result<ReadingArchive> {
    readings.sort_by_key(|reading| (reading.timestamp, reading.id));
    let reading_count = i64::try_from(readings.len()).context("too many readings to archive")?;
    let canonical = serde_json::to_vec(&ArchiveEnvelope {
        format_version: ARCHIVE_FORMAT_VERSION,
        readings,
    })?;
    let compressed_data = zstd::stream::encode_all(Cursor::new(&canonical), ZSTD_LEVEL)?;
    let verified = zstd::stream::decode_all(Cursor::new(&compressed_data))?;
    if verified != canonical {
        bail!("archive round-trip mismatch for {session_id}");
    }
    Ok(ReadingArchive {
        session_id,
        format_version: ARCHIVE_FORMAT_VERSION,
        reading_count,
        uncompressed_bytes: i64::try_from(canonical.len())?,
        checksum: checksum(&canonical),
        compressed_data,
        created_at: Utc::now(),
    })
}

pub async fn archive_session(db: &Database, session_id: &str) -> Result<()> {
    let readings = ensure_segments_and_runs(db, session_id).await?;
    let id = session_id.to_string();
    let archive = tokio::task::spawn_blocking(move || build_archive(id, readings))
        .await
        .context("archive compression task panicked")??;
    db.archive_verified_readings(archive).await
}

fn decode_archive(archive: ReadingArchive) -> Result<Vec<ContextReading>> {
    if archive.format_version != ARCHIVE_FORMAT_VERSION {
        bail!(
            "unsupported reading archive format {}",
            archive.format_version
        );
    }
    if archive.uncompressed_bytes < 0 || archive.uncompressed_bytes as u64 > MAX_RESTORE_BYTES {
        bail!("archive exceeds the safe restore size limit");
    }
    let decoder = zstd::stream::read::Decoder::new(Cursor::new(archive.compressed_data))?;
    let mut bytes = Vec::new();
    decoder
        .take(MAX_RESTORE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as i64 != archive.uncompressed_bytes || checksum(&bytes) != archive.checksum {
        bail!(
            "archive integrity verification failed for {}",
            archive.session_id
        );
    }
    let envelope: ArchiveEnvelope = serde_json::from_slice(&bytes)?;
    if envelope.format_version != ARCHIVE_FORMAT_VERSION
        || envelope.readings.len() as i64 != archive.reading_count
        || envelope
            .readings
            .iter()
            .any(|reading| reading.session_id != archive.session_id)
    {
        bail!("archive contents are invalid for {}", archive.session_id);
    }
    Ok(envelope.readings)
}

pub async fn restore_session_readings(db: &Database, session_id: &str) -> Result<usize> {
    let archive = db
        .get_reading_archive(session_id)
        .await?
        .ok_or_else(|| anyhow!("no reading archive exists for session {session_id}"))?;
    let readings = tokio::task::spawn_blocking(move || decode_archive(archive))
        .await
        .context("archive restore task panicked")??;
    let count = readings.len();
    db.restore_context_readings(session_id, &readings).await?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Session, SessionStatus};
    use crate::macos_bridge::{WindowBounds, WindowMetadata};
    use std::path::PathBuf;
    use uuid::Uuid;

    fn reading(second: i64, bundle: &str, title: &str, segment: Option<&str>) -> ContextReading {
        ContextReading {
            id: Some(second),
            session_id: "session".into(),
            timestamp: chrono::DateTime::parse_from_rfc3339("2026-08-19T12:00:00Z")
                .unwrap()
                .with_timezone(&Utc)
                + Duration::seconds(second),
            window_metadata: WindowMetadata {
                window_id: 0,
                bundle_id: bundle.into(),
                title: title.into(),
                owner_name: bundle.into(),
                bounds: WindowBounds {
                    x: 0.0,
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                },
            },
            phash: None,
            ocr_text: None,
            ocr_confidence: None,
            ocr_word_count: None,
            segment_id: segment.map(str::to_string),
        }
    }

    #[test]
    fn runs_split_on_app_title_gap_and_segment() {
        let readings = vec![
            reading(0, "a", "Old title", Some("1")),
            reading(5, "a", "Old title", Some("1")),
            reading(10, "a", "", Some("1")),
            reading(15, "b", "", Some("2")),
            reading(40, "b", "", Some("2")),
        ];
        let runs = generate_activity_runs(readings);
        assert_eq!(runs.len(), 4);
        assert_eq!(runs.iter().map(|run| run.sample_count).sum::<i64>(), 5);
        assert_eq!(runs[0].window_title.as_deref(), Some("Old title"));
        assert_eq!(runs[1].window_title, None);
    }

    #[test]
    fn archive_round_trip_is_exact() -> Result<()> {
        let readings = vec![reading(0, "a", "", None), reading(5, "a", "Title", None)];
        let archive = build_archive("session".into(), readings.clone())?;
        let restored = decode_archive(archive)?;
        assert_eq!(
            serde_json::to_vec(&restored)?,
            serde_json::to_vec(&readings)?
        );
        Ok(())
    }

    fn temp_database_path() -> PathBuf {
        std::env::temp_dir().join(format!("lefocus-storage-test-{}.sqlite3", Uuid::new_v4()))
    }

    fn completed_session(id: &str) -> Session {
        let now = Utc::now();
        Session {
            id: id.into(),
            started_at: now - Duration::minutes(1),
            stopped_at: Some(now),
            status: SessionStatus::Completed,
            target_ms: 60_000,
            active_ms: 60_000,
            label_id: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn remove_test_database(path: &PathBuf) {
        for suffix in ["", "-wal", "-shm"] {
            let mut value = path.as_os_str().to_os_string();
            value.push(suffix);
            let _ = std::fs::remove_file(PathBuf::from(value));
        }
    }

    #[tokio::test]
    async fn archive_restore_and_session_delete_preserve_invariants() -> Result<()> {
        let path = temp_database_path();
        let db = Database::new(path.clone())?;
        db.insert_session(&completed_session("session")).await?;
        db.execute(|conn| {
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO apps
                 (id, bundle_id, app_name, icon_data_url, created_at, updated_at)
                 VALUES ('app', 'com.test.a', 'Test', 'icon', ?1, ?1)",
                rusqlite::params![now],
            )?;
            Ok(())
        })
        .await?;
        db.insert_context_reading(&reading(0, "com.test.a", "Historical title", None))
            .await?;
        db.insert_context_reading(&reading(5, "com.test.a", "Historical title", None))
            .await?;

        archive_session(&db, "session").await?;
        assert!(db
            .get_context_readings_for_session("session")
            .await?
            .is_empty());
        assert_eq!(
            db.get_reading_archive("session")
                .await?
                .unwrap()
                .reading_count,
            2
        );
        let segments = db.get_segments_for_session("session").await?;
        assert_eq!(segments.len(), 1);
        assert_eq!(
            db.get_unique_window_titles_for_segment(&segments[0].id)
                .await?,
            vec![("Historical title".into(), 10)]
        );
        assert_eq!(
            db.get_window_titles_for_app_in_range(
                "com.test.a",
                segments[0].start_time,
                segments[0].end_time,
            )
            .await?,
            vec![("Historical title".into(), 10)]
        );

        assert_eq!(restore_session_readings(&db, "session").await?, 2);
        let restored = db.get_context_readings_for_session("session").await?;
        assert_eq!(restored.len(), 2);
        assert_eq!(restored[0].window_metadata.title, "Historical title");

        db.delete_session("session").await?;
        let orphan_counts = db
            .execute(|conn| {
                Ok((
                    conn.query_row("SELECT COUNT(*) FROM context_readings", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                    conn.query_row("SELECT COUNT(*) FROM activity_runs", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                    conn.query_row("SELECT COUNT(*) FROM session_reading_archives", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                    conn.query_row("SELECT COUNT(*) FROM segments", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                ))
            })
            .await?;
        assert_eq!(orphan_counts, (0, 0, 0, 0));

        drop(db);
        remove_test_database(&path);
        Ok(())
    }

    #[tokio::test]
    async fn activity_summary_batches_top_apps_and_icons() -> Result<()> {
        let path = temp_database_path();
        let db = Database::new(path.clone())?;
        db.insert_session(&completed_session("summary-session"))
            .await?;
        db.execute(|conn| {
            let now = Utc::now().to_rfc3339();
            for (bundle, name, duration, icon) in [
                ("com.test.a", "A", 40_i64, Some("icon-a")),
                ("com.test.b", "B", 20_i64, None),
                ("com.test.c", "C", 10_i64, None),
                ("com.test.d", "D", 5_i64, None),
            ] {
                conn.execute(
                    "INSERT INTO apps
                     (id, bundle_id, app_name, icon_data_url, created_at, updated_at)
                     VALUES (?1, ?1, ?2, ?3, ?4, ?4)",
                    rusqlite::params![bundle, name, icon, now],
                )?;
                conn.execute(
                    "INSERT INTO segments
                     (id, session_id, start_time, end_time, duration_secs, bundle_id,
                      app_name, window_title, confidence, duration_score, stability_score,
                      visual_clarity_score, ocr_quality_score, reading_count,
                      unique_phash_count, segment_summary)
                     VALUES (?1, 'summary-session', ?2, ?2, ?3, ?1, ?4, NULL,
                             1.0, NULL, NULL, NULL, NULL, 1, NULL, NULL)",
                    rusqlite::params![bundle, now, duration, name],
                )?;
            }
            Ok(())
        })
        .await?;

        let summaries = db.list_session_summaries(Some(20), 0).await?;
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].top_apps.len(), 3);
        assert_eq!(summaries[0].top_apps[0].bundle_id, "com.test.a");
        assert_eq!(summaries[0].top_apps[0].duration_secs, 40);
        assert_eq!(
            summaries[0].app_icons["com.test.a"].as_deref(),
            Some("icon-a")
        );
        assert!((summaries[0].top_apps[0].percentage - (40.0 / 75.0 * 100.0)).abs() < 0.001);

        drop(db);
        remove_test_database(&path);
        Ok(())
    }
}
