use tauri::State;

use crate::{
    db::models::{Label, LabelInput},
    AppState,
};

#[tauri::command]
pub async fn create_label(state: State<'_, AppState>, input: LabelInput) -> Result<Label, String> {
    let db = &state.db;
    db.create_label(input.name, input.color)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_labels(state: State<'_, AppState>) -> Result<Vec<Label>, String> {
    let db = &state.db;
    db.get_labels().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_label(
    state: State<'_, AppState>,
    label_id: i64,
    name: Option<String>,
    color: Option<String>,
) -> Result<Label, String> {
    let db = &state.db;
    db.update_label(label_id, name, color)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_label(state: State<'_, AppState>, label_id: i64) -> Result<(), String> {
    let db = &state.db;
    db.soft_delete_label(label_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_session_label(
    state: State<'_, AppState>,
    session_id: String,
    label_id: Option<i64>,
) -> Result<(), String> {
    let db = &state.db;
    db.update_session_label(&session_id, label_id)
        .await
        .map_err(|e| e.to_string())
}
