use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use log::{error, info, warn};
use tokio::time::{Duration, Instant, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

use crate::{
    db::{ContextReading, Database},
    macos_bridge::{capture_screenshot, get_active_window_metadata, run_ocr},
};

use super::phash::{compute_hamming_distance, compute_phash};

const CAPTURE_INTERVAL_SECS: u64 = 5;
const CAPTURE_TIMEOUT_SECS: u64 = 3;
const OCR_COOLDOWN_SECS: u64 = 0;
const PHASH_CHANGE_THRESHOLD: u32 = 8;

pub async fn sensing_loop(session_id: String, db: Database, cancel_token: CancellationToken) {
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
                    &mut last_sampled_phash,
                    &mut last_ocr_phash,
                    &mut last_ocr_time,
                );

                match tokio::time::timeout(Duration::from_secs(CAPTURE_TIMEOUT_SECS), fut).await {
                    Ok(Ok(())) => {},
                    Ok(Err(err)) => error!("sensing capture failed for session {}: {err:?}", session_id),
                    Err(_) => warn!("sensing capture timeout (> {}s) session {}", CAPTURE_TIMEOUT_SECS, session_id),
                }
            }
            _ = cancel_token.cancelled() => {
                info!("sensing loop shutting down");
                break;
            }
        }
    }
}

async fn perform_capture(
    session_id: &str,
    timestamp: DateTime<Utc>,
    db: &Database,
    last_sampled_phash: &mut Option<String>,
    last_ocr_phash: &mut Option<String>,
    last_ocr_time: &mut Option<Instant>,
) -> Result<()> {
    let metadata = get_active_window_metadata()
        .map_err(|err| anyhow!("active window metadata failed: {err}"))?;
    
    // Skip if no bundle_id (system windows like menu bar, dock)
    if metadata.bundle_id.is_empty() {
        warn!("Warning: Skipping window_id={} with empty bundle_id (system window)", metadata.window_id);
        return Ok(());
    }

    let png_bytes = capture_screenshot(metadata.window_id)
        .map_err(|err| anyhow!("screenshot capture failed: {err}"))?;
    
    // Skip if screenshot is suspiciously small (likely error/blank)
    // TODO: remove
    if png_bytes.len() < 1000 {
        warn!("Warning: Screenshot too small ({} bytes) for window_id={} ({}), likely hidden/minimized - skipping", 
            png_bytes.len(), metadata.window_id, metadata.bundle_id);
        return Ok(());
    }
    
    info!("Screenshot: {} bytes, window_id={}, bundle={}", 
        png_bytes.len(), metadata.window_id, metadata.bundle_id);

    let phash = tokio::task::spawn_blocking({
        let bytes = png_bytes.clone();
        move || compute_phash(&bytes)
    })
    .await
    .context("phash worker join failed")??;
    
    // TODO: remove
    info!("Computed pHash: {}", phash);

    let should_run_ocr =
        should_perform_ocr(&phash, last_ocr_phash.as_deref(), last_ocr_time.as_ref());

    let (ocr_text, ocr_confidence, ocr_word_count) = if should_run_ocr {
        match run_ocr(&png_bytes) {
            Ok(result) => {
                *last_ocr_time = Some(Instant::now());
                *last_ocr_phash = Some(phash.clone());
                (
                    Some(result.text),
                    Some(result.confidence),
                    Some(result.word_count),
                )
            }
            Err(err) => {
                warn!("ocr failed: {err}");
                (None, None, None)
            }
        }
    } else {
        (None, None, None)
    };

    *last_sampled_phash = Some(phash.clone());

    let reading = ContextReading {
        id: None,
        session_id: session_id.to_string(),
        timestamp,
        window_metadata: metadata,
        phash: Some(phash),
        ocr_text,
        ocr_confidence,
        ocr_word_count,
    };

    db.insert_context_reading(&reading)
        .await
        .context("failed to persist context reading")?;

    Ok(())
}

fn should_perform_ocr(
    current_phash: &str,
    last_ocr_phash: Option<&str>,
    last_ocr_time: Option<&Instant>,
) -> bool {
    let Some(prev_phash) = last_ocr_phash else {
        return true;
    };

    if !cooldown_elapsed(last_ocr_time) {
        return false;
    }

    let distance = compute_hamming_distance(current_phash, prev_phash);
    distance >= PHASH_CHANGE_THRESHOLD
}

fn cooldown_elapsed(last_ocr_time: Option<&Instant>) -> bool {
    last_ocr_time
        .map(|instant| instant.elapsed().as_secs() >= OCR_COOLDOWN_SECS)
        .unwrap_or(true)
}
