use tauri::State;

use crate::{
    db::{
        models::{DailyActivity, Interruption, Segment, SessionSummary, StatsRange},
        SessionInfo,
    },
    timer::{TimerController, TimerMode, TimerSnapshot, TimerState},
};

use crate::AppState;

fn controller_from_state(state: &State<'_, AppState>) -> TimerController {
    state.timer.clone()
}

#[tauri::command]
pub async fn get_timer_state(state: State<'_, AppState>) -> Result<TimerSnapshot, String> {
    let controller = controller_from_state(&state);
    Ok(controller.get_snapshot().await)
}

#[tauri::command]
pub async fn start_timer(
    state: State<'_, AppState>,
    target_ms: u64,
    mode: Option<TimerMode>,
    label_id: Option<i64>,
) -> Result<TimerState, String> {
    let controller = controller_from_state(&state);

    controller
        .start_timer(target_ms, mode, label_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn end_timer(state: State<'_, AppState>) -> Result<SessionInfo, String> {
    let controller = controller_from_state(&state);
    controller.end_timer().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_timer(state: State<'_, AppState>) -> Result<(), String> {
    let controller = controller_from_state(&state);
    controller.cancel_timer().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_segments_for_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Segment>, String> {
    let db = &state.db;
    db.get_segments_for_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

fn parse_stats_range(
    start_time: &str,
    end_time: &str,
) -> Result<(chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>), String> {
    let start = chrono::DateTime::parse_from_rfc3339(start_time)
        .map_err(|e| format!("invalid stats start time: {e}"))?
        .with_timezone(&chrono::Utc);
    let end = chrono::DateTime::parse_from_rfc3339(end_time)
        .map_err(|e| format!("invalid stats end time: {e}"))?
        .with_timezone(&chrono::Utc);

    if start > end {
        return Err("stats start time must not be after end time".to_string());
    }

    Ok((start, end))
}

#[tauri::command]
pub async fn get_stats_in_time_range(
    state: State<'_, AppState>,
    start_time: String,
    end_time: String,
    label_id: Option<i64>,
) -> Result<StatsRange, String> {
    let (start, end) = parse_stats_range(&start_time, &end_time)?;
    state
        .db
        .get_stats_in_range(start, end, label_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_daily_activity_in_time_range(
    state: State<'_, AppState>,
    start_time: String,
    end_time: String,
    label_id: Option<i64>,
) -> Result<Vec<DailyActivity>, String> {
    let (start, end) = parse_stats_range(&start_time, &end_time)?;
    state
        .db
        .get_daily_activity_in_range(start, end, label_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_interruptions_for_segment(
    state: State<'_, AppState>,
    segment_id: String,
) -> Result<Vec<Interruption>, String> {
    let db = &state.db;
    db.get_interruptions_for_segment(&segment_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_window_titles_for_segment(
    state: State<'_, AppState>,
    segment_id: String,
) -> Result<Vec<(String, i64)>, String> {
    let db = &state.db;
    db.get_unique_window_titles_for_segment(&segment_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct AppDetails {
    pub window_titles: Vec<(String, i64)>,
}

#[tauri::command]
pub async fn get_app_details_in_time_range(
    state: State<'_, AppState>,
    bundle_id: String,
    start_time: String,
    end_time: String,
) -> Result<AppDetails, String> {
    let db = &state.db;

    let start = chrono::DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| e.to_string())?
        .with_timezone(&chrono::Utc);
    let end = chrono::DateTime::parse_from_rfc3339(&end_time)
        .map_err(|e| e.to_string())?
        .with_timezone(&chrono::Utc);

    let window_titles = db
        .get_window_titles_for_app_in_range(&bundle_id, start, end)
        .await
        .map_err(|e| e.to_string())?;

    Ok(AppDetails { window_titles })
}

/// Legacy unpaginated session API. Stats uses bounded range queries.
#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionSummary>, String> {
    state
        .db
        .list_session_summaries(None, 0)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions_paginated(
    state: State<'_, AppState>,
    limit: usize,
    offset: usize,
) -> Result<Vec<SessionSummary>, String> {
    state
        .db
        .list_session_summaries(Some(limit), offset)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state
        .db
        .delete_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}
