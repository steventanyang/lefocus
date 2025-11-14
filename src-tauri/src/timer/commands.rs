use tauri::State;

use crate::{
    db::{models::{Interruption, Segment, SessionSummary}, SessionInfo},
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
) -> Result<TimerState, String> {
    let controller = controller_from_state(&state);

    controller
        .start_timer(target_ms, mode)
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
) -> Result<Vec<String>, String> {
    let db = &state.db;
    db.get_unique_window_titles_for_segment(&segment_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionSummary>, String> {
    use std::collections::{HashMap, HashSet};
    let db = &state.db;

    // Get all sessions (completed + interrupted)
    let sessions = db.list_sessions()
        .await
        .map_err(|e| e.to_string())?;

    // For each session, get top 3 apps
    let mut summaries = Vec::new();
    let mut all_bundle_ids = HashSet::new();

    for session in sessions {
        let top_apps = db.get_top_apps_for_session(&session.id, 3)
            .await
            .map_err(|e| e.to_string())?;

        // Collect all unique bundle IDs
        for app in &top_apps {
            all_bundle_ids.insert(app.bundle_id.clone());
        }

        summaries.push(SessionSummary {
            id: session.id,
            started_at: session.started_at,
            stopped_at: session.stopped_at,
            status: session.status,
            target_ms: session.target_ms,
            active_ms: session.active_ms,
            top_apps,
            app_icons: HashMap::new(), // Will be populated below
            app_colors: HashMap::new(), // Will be populated below
        });
    }

    // Fetch all app icons and colors in one go
    let app_icons_and_colors = db.get_app_icons_for_bundle_ids(&all_bundle_ids.into_iter().collect::<Vec<_>>())
        .await
        .map_err(|e| e.to_string())?;

    // Split into separate maps for icons and colors
    let mut app_icons = HashMap::new();
    let mut app_colors = HashMap::new();
    for (bundle_id, (icon, color)) in app_icons_and_colors {
        app_icons.insert(bundle_id.clone(), icon);
        app_colors.insert(bundle_id, color);
    }

    // Share the same maps across all summaries (efficient - no duplication)
    for summary in &mut summaries {
        summary.app_icons = app_icons.clone();
        summary.app_colors = app_colors.clone();
    }

    Ok(summaries)
}
