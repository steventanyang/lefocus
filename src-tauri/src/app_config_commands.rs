//! Tauri commands for app config management
//!
//! See system design documentation: phase-5-app-configs.md

use tauri::State;

use crate::{
    db::models::{AppConfig, DetectedApp},
    AppState,
};

#[tauri::command]
pub async fn get_app_config(
    state: State<'_, AppState>,
    bundle_id: String,
) -> Result<Option<AppConfig>, String> {
    state
        .db
        .get_app_config(bundle_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_app_configs(state: State<'_, AppState>) -> Result<Vec<AppConfig>, String> {
    state
        .db
        .get_all_app_configs()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_app_config(
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<AppConfig, String> {
    state
        .db
        .upsert_app_config(config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_app_config(
    state: State<'_, AppState>,
    bundle_id: String,
) -> Result<(), String> {
    state
        .db
        .delete_app_config(bundle_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_detected_apps(
    state: State<'_, AppState>,
) -> Result<Vec<DetectedApp>, String> {
    state
        .db
        .get_all_detected_apps()
        .await
        .map_err(|e| e.to_string())
}
