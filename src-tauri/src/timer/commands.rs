use tauri::State;

use crate::{
    db::{models::{Interruption, Segment}, SessionInfo},
    timer::{TimerController, TimerSnapshot, TimerState},
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
pub async fn start_timer(state: State<'_, AppState>, target_ms: u64) -> Result<TimerState, String> {
    let controller = controller_from_state(&state);
    controller
        .start_timer(target_ms)
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
