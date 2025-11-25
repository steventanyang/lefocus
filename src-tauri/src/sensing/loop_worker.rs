use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::time::{Duration, Instant, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

use crate::{
    db::{ContextReading, Database},
    macos_bridge::{capture_screenshot, get_active_window_metadata, run_ocr},
    metrics::{CaptureMetrics, MetricsCollector},
};

use super::icon_manager::IconManager;
use super::phash::{compute_hamming_distance, compute_phash};

const ENABLE_LOGS: bool = true;

use crate::{log_error, log_info, log_warn};

const CAPTURE_INTERVAL_SECS: u64 = 5;
const CAPTURE_TIMEOUT_SECS: u64 = 10;
const OCR_COOLDOWN_SECS: u64 = 20;
const PHASH_CHANGE_THRESHOLD: u32 = 8;

pub async fn sensing_loop(
    session_id: String,
    db: Database,
    icon_manager: IconManager,
    cancel_token: CancellationToken,
    metrics: MetricsCollector,
    app_handle: AppHandle,
) {
    let mut ticker = tokio::time::interval(Duration::from_secs(CAPTURE_INTERVAL_SECS));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

    let mut last_sampled_phash: Option<String> = None;
    let mut last_ocr_phash: Option<String> = None;
    let mut last_ocr_time: Option<Instant> = None;

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                let timestamp = Utc::now();
                let fut = perform_capture(
                    &session_id,
                    timestamp,
                    &db,
                    &icon_manager,
                    &mut last_sampled_phash,
                    &mut last_ocr_phash,
                    &mut last_ocr_time,
                    &metrics,
                    &app_handle,
                );

                match tokio::time::timeout(Duration::from_secs(CAPTURE_TIMEOUT_SECS), fut).await {
                    Ok(Ok(())) => {},
                    Ok(Err(err)) => log_error!("sensing capture failed for session {}: {err:?}", session_id),
                    Err(_) => log_warn!("sensing capture timeout (> {}s) session {}", CAPTURE_TIMEOUT_SECS, session_id),
                }
            }
            _ = cancel_token.cancelled() => {
                log_info!("sensing loop shutting down");
                break;
            }
        }
    }
}

async fn perform_capture(
    session_id: &str,
    timestamp: DateTime<Utc>,
    db: &Database,
    icon_manager: &IconManager,
    last_sampled_phash: &mut Option<String>,
    last_ocr_phash: &mut Option<String>,
    last_ocr_time: &mut Option<Instant>,
    metrics_collector: &MetricsCollector,
    app_handle: &AppHandle,
) -> Result<()> {
    let capture_start = Instant::now();

    // Sample CPU/RAM at start of capture
    let (cpu_percent, memory_mb) = metrics_collector.sample_system_metrics().await;

    let metadata_start = Instant::now();
    let mut metadata = get_active_window_metadata()
        .map_err(|err| anyhow!("active window metadata failed: {err}"))?;
    let metadata_duration_ms = metadata_start.elapsed().as_millis() as u64;

    if !metadata.bundle_id.is_empty() && metadata.bundle_id != "com.apple.system" {
        icon_manager
            .ensure_icon(&metadata.bundle_id, Some(&metadata.owner_name))
            .await;
    }

    let is_system_window = metadata.bundle_id.is_empty();
    if is_system_window {
        log_info!(
            "Detected system window (window_id={}), recording as System UI - took {}ms",
            metadata.window_id,
            metadata_duration_ms
        );
        metadata.bundle_id = "com.apple.system".to_string();
        metadata.owner_name = "System UI".to_string();

        let reading = ContextReading {
            id: None,
            session_id: session_id.to_string(),
            timestamp,
            window_metadata: metadata,
            phash: None,
            ocr_text: None,
            ocr_confidence: None,
            ocr_word_count: None,
            segment_id: None,
        };

        let db_start = Instant::now();
        db.insert_context_reading(&reading)
            .await
            .context("failed to persist system window reading")?;
        let db_duration_ms = db_start.elapsed().as_millis() as u64;

        let capture_duration_ms = capture_start.elapsed().as_millis() as u64;
        log_info!(
            "System window captured in {}ms (metadata only)",
            capture_duration_ms
        );

        let capture_metrics = CaptureMetrics {
            timestamp,
            metadata_ms: metadata_duration_ms,
            screenshot_ms: 0,
            screenshot_bytes: 0,
            phash_ms: 0,
            ocr_ms: None,
            ocr_skipped_reason: Some("system_window".to_string()),
            db_write_ms: db_duration_ms,
            total_ms: capture_duration_ms,
            cpu_percent,
            memory_mb,
        };
        metrics_collector.record_capture(capture_metrics.clone()).await;
        let _ = app_handle.emit("sensing-metrics", capture_metrics);

        return Ok(());
    }

    let window_id = metadata.window_id;
    let screenshot_start = Instant::now();
    let png_bytes = tokio::task::spawn_blocking(move || capture_screenshot(window_id))
        .await
        .context("screenshot capture worker join failed")?
        .map_err(|err| anyhow!("screenshot capture failed: {err}"))?;
    let screenshot_duration_ms = screenshot_start.elapsed().as_millis() as u64;
    let screenshot_bytes = png_bytes.len();

    if png_bytes.len() < 1000 {
        let capture_duration_ms = capture_start.elapsed().as_millis() as u64;
        log_warn!("Warning: Screenshot too small ({} bytes) for window_id={} ({}), likely hidden/minimized - skipping (took {}ms, screenshot: {}ms)", 
            png_bytes.len(), metadata.window_id, metadata.bundle_id, capture_duration_ms, screenshot_duration_ms);
        return Ok(());
    }

    log_info!(
        "Screenshot: {} bytes, window_id={}, bundle={}, screenshot_time={}ms",
        png_bytes.len(),
        metadata.window_id,
        metadata.bundle_id,
        screenshot_duration_ms
    );

    let png_bytes_arc = Arc::new(png_bytes);

    let phash_start = Instant::now();
    let phash = tokio::task::spawn_blocking({
        let bytes = Arc::clone(&png_bytes_arc);
        move || compute_phash(&bytes)
    })
    .await
    .context("phash worker join failed")??;
    let phash_duration_ms = phash_start.elapsed().as_millis() as u64;

    log_info!(
        "Computed pHash: {}, total_phash_time={}ms",
        phash,
        phash_duration_ms
    );

    let (should_run_ocr, ocr_skip_reason) =
        should_perform_ocr_with_reason(&phash, last_ocr_phash.as_deref(), last_ocr_time.as_ref());

    let (ocr_text, ocr_confidence, ocr_word_count, ocr_duration_ms) = if should_run_ocr {
        let ocr_start = Instant::now();
        match tokio::task::spawn_blocking({
            let bytes = Arc::clone(&png_bytes_arc);
            move || run_ocr(&bytes)
        })
        .await
        .context("ocr worker join failed")?
        {
            Ok(result) => {
                let ocr_ms = ocr_start.elapsed().as_millis() as u64;
                log_info!(
                    "OCR completed: {} words, confidence={:.2}, ocr_time={}ms",
                    result.word_count,
                    result.confidence,
                    ocr_ms
                );
                *last_ocr_time = Some(Instant::now());
                *last_ocr_phash = Some(phash.clone());
                (
                    Some(result.text),
                    Some(result.confidence),
                    Some(result.word_count),
                    Some(ocr_ms),
                )
            }
            Err(err) => {
                let ocr_ms = ocr_start.elapsed().as_millis() as u64;
                log_warn!("ocr failed after {}ms: {err}", ocr_ms);
                (None, None, None, Some(ocr_ms))
            }
        }
    } else {
        (None, None, None, None)
    };

    *last_sampled_phash = Some(phash.clone());

    let db_start = Instant::now();
    let reading = ContextReading {
        id: None,
        session_id: session_id.to_string(),
        timestamp,
        window_metadata: metadata,
        phash: Some(phash),
        ocr_text,
        ocr_confidence,
        ocr_word_count,
        segment_id: None,
    };

    db.insert_context_reading(&reading)
        .await
        .context("failed to persist context reading")?;
    let db_duration_ms = db_start.elapsed().as_millis() as u64;

    let capture_duration_ms = capture_start.elapsed().as_millis() as u64;
    log_info!("Capture completed in {}ms for session {} (metadata: {}ms, screenshot: {}ms, phash: {}ms, db: {}ms)", 
        capture_duration_ms, session_id, metadata_duration_ms, screenshot_duration_ms, phash_duration_ms, db_duration_ms);

    let capture_metrics = CaptureMetrics {
        timestamp,
        metadata_ms: metadata_duration_ms,
        screenshot_ms: screenshot_duration_ms,
        screenshot_bytes,
        phash_ms: phash_duration_ms,
        ocr_ms: ocr_duration_ms,
        ocr_skipped_reason: ocr_skip_reason,
        db_write_ms: db_duration_ms,
        total_ms: capture_duration_ms,
        cpu_percent,
        memory_mb,
    };
    metrics_collector.record_capture(capture_metrics.clone()).await;
    let _ = app_handle.emit("sensing-metrics", capture_metrics);

    Ok(())
}

fn should_perform_ocr_with_reason(
    current_phash: &str,
    last_ocr_phash: Option<&str>,
    last_ocr_time: Option<&Instant>,
) -> (bool, Option<String>) {
    let Some(prev_phash) = last_ocr_phash else {
        return (true, None);
    };

    if !cooldown_elapsed(last_ocr_time) {
        return (false, Some("cooldown".to_string()));
    }

    let distance = compute_hamming_distance(current_phash, prev_phash);
    if distance >= PHASH_CHANGE_THRESHOLD {
        (true, None)
    } else {
        (false, Some("no_change".to_string()))
    }
}

fn cooldown_elapsed(last_ocr_time: Option<&Instant>) -> bool {
    last_ocr_time
        .map(|instant| instant.elapsed().as_secs() >= OCR_COOLDOWN_SECS)
        .unwrap_or(true)
}
