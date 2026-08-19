use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use tauri::{AppHandle, Emitter};
use tokio::time::{Duration, Instant, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

use crate::{
    db::{ContextReading, Database},
    macos_bridge::get_active_window_metadata,
    metrics::{CaptureMetrics, MetricsCollector},
};

use super::icon_manager::IconManager;

const ENABLE_LOGS: bool = true;

use crate::{log_error, log_info, log_warn};

const CAPTURE_INTERVAL_SECS: u64 = 5;
const CAPTURE_TIMEOUT_SECS: u64 = 10;

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

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                let timestamp = Utc::now();
                let fut = perform_capture(
                    &session_id,
                    timestamp,
                    &db,
                    &icon_manager,
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

/// Capture frontmost-application metadata and persist it for segmentation.
async fn perform_capture(
    session_id: &str,
    timestamp: DateTime<Utc>,
    db: &Database,
    icon_manager: &IconManager,
    metrics_collector: &MetricsCollector,
    app_handle: &AppHandle,
) -> Result<()> {
    let capture_start = Instant::now();

    // Sample CPU/RAM at start of capture
    let (cpu_percent, memory_mb) = metrics_collector.sample_system_metrics().await;

    // Fetch the globally frontmost application through NSWorkspace.
    let metadata_start = Instant::now();
    let mut metadata = get_active_window_metadata()
        .map_err(|err| anyhow!("active window metadata failed: {err}"))?;
    let metadata_duration_ms = metadata_start.elapsed().as_millis() as u64;

    // Handle system windows (empty bundle_id)
    if metadata.bundle_id.is_empty() {
        metadata.bundle_id = "com.apple.system".to_string();
        metadata.owner_name = "System UI".to_string();
    }

    // Ensure icon is cached for this app
    if !metadata.bundle_id.is_empty() && metadata.bundle_id != "com.apple.system" {
        icon_manager
            .ensure_icon(&metadata.bundle_id, Some(&metadata.owner_name))
            .await;
    }

    // Legacy visual/OCR fields stay null for database compatibility.
    let db_start = Instant::now();
    let reading = ContextReading {
        id: None,
        session_id: session_id.to_string(),
        timestamp,
        window_metadata: metadata.clone(),
        phash: None,
        ocr_text: None,
        ocr_confidence: None,
        ocr_word_count: None,
        segment_id: None,
    };

    db.insert_context_reading(&reading)
        .await
        .map_err(|err| anyhow!("failed to persist context reading: {err}"))?;
    let db_duration_ms = db_start.elapsed().as_millis() as u64;

    let capture_duration_ms = capture_start.elapsed().as_millis() as u64;
    log_info!(
        "Capture completed in {}ms for session {} (metadata: {}ms, db: {}ms) - {}",
        capture_duration_ms,
        session_id,
        metadata_duration_ms,
        db_duration_ms,
        metadata.bundle_id
    );

    let capture_metrics = CaptureMetrics {
        timestamp,
        metadata_ms: metadata_duration_ms,
        db_write_ms: db_duration_ms,
        total_ms: capture_duration_ms,
        cpu_percent,
        memory_mb,
    };
    metrics_collector
        .record_capture(capture_metrics.clone())
        .await;
    let _ = app_handle.emit("sensing-metrics", capture_metrics);

    Ok(())
}
