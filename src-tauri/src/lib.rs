mod audio;
mod db;
mod labels;
mod macos_bridge;
mod segmentation;
mod sensing;
mod settings;
mod timer;
mod utils;

use audio::AudioEngineHandle;
use chrono::Utc;
use db::Database;
use labels::commands::{
    create_label, delete_label, get_labels, update_label, update_session_label,
};
use log::warn;
use macos_bridge::{
    capture_screenshot, get_active_window_metadata, run_ocr, OCRResult, WindowMetadata,
};
use settings::{IslandSoundSettings, SettingsStore};
use tauri::{Emitter, Manager, State};
use timer::{
    commands::{
        cancel_timer, end_timer, get_interruptions_for_segment, get_segments_for_session,
        get_timer_state, get_window_titles_for_segment, list_sessions, list_sessions_paginated,
        start_timer, get_app_details_in_time_range, delete_session,
    },
    TimerController,
};

pub(crate) struct AppState {
    audio: AudioEngineHandle,
    pub(crate) db: Database,
    pub(crate) timer: TimerController,
    pub(crate) settings: SettingsStore,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub enum SoundType {
    Binaural,
    BrownNoise,
    Rain,
}

#[tauri::command]
fn start_audio(
    sound_type: SoundType,
    left_freq: Option<f32>,
    right_freq: Option<f32>,
    state: State<AppState>,
) -> Result<String, String> {
    // Initialize new audio engine and add the appropriate source
    state.audio.start()?;

    match sound_type {
        SoundType::Binaural => {
            let left = left_freq.unwrap_or(200.0);
            let right = right_freq.unwrap_or(204.0);
            state.audio.append_binaural(left, right)?;
        }
        SoundType::BrownNoise => {
            state.audio.append_brown_noise()?;
        }
        SoundType::Rain => {
            state.audio.append_rain()?;
        }
    }

    state.audio.play()?;

    Ok("Audio started".to_string())
}

#[tauri::command]
fn stop_audio(state: State<AppState>) -> Result<String, String> {
    state.audio.stop()?;
    Ok("Audio stopped".to_string())
}

#[tauri::command]
fn toggle_pause(state: State<AppState>) -> Result<bool, String> {
    let is_paused = state.audio.is_paused()?;

    if is_paused {
        state.audio.play()?;
        Ok(false) // Not paused anymore
    } else {
        state.audio.pause()?;
        Ok(true) // Now paused
    }
}

#[tauri::command]
fn set_volume(volume: f32, state: State<AppState>) -> Result<String, String> {
    state.audio.set_volume(volume)?;
    Ok(format!("Volume set to {}", volume))
}

#[tauri::command]
fn test_get_window() -> Result<WindowMetadata, String> {
    get_active_window_metadata().map_err(|e| e.to_string())
}

#[tauri::command]
fn test_capture_screenshot(window_id: u32) -> Result<String, String> {
    let image_data = capture_screenshot(window_id).map_err(|e| e.to_string())?;

    let output_path = std::path::Path::new("/tmp/lefocus_test_screenshot.png");
    std::fs::write(output_path, &image_data).map_err(|e| e.to_string())?;

    Ok(format!(
        "Screenshot saved to {} ({} bytes)",
        output_path.display(),
        image_data.len()
    ))
}

#[tauri::command]
fn test_run_ocr(image_path: String) -> Result<OCRResult, String> {
    let image_data = std::fs::read(&image_path).map_err(|e| e.to_string())?;

    run_ocr(&image_data).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_island_sound_settings(state: State<AppState>) -> Result<IslandSoundSettings, String> {
    Ok(state.settings.island_sound())
}

#[tauri::command]
fn set_island_sound_settings(
    settings: IslandSoundSettings,
    state: State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state
        .settings
        .update_island_sound(settings.clone())
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        macos_bridge::island_update_chime_preferences(settings.enabled, &settings.sound_id);
    }

    app_handle
        .emit("island-sound-settings-updated", &settings)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn preview_island_chime(sound_id: Option<String>, sound_id_camel: Option<String>) -> Result<(), String> {
    let sound_id = sound_id
        .or(sound_id_camel)
        .ok_or_else(|| "sound_id is required".to_string())?;
    #[cfg(target_os = "macos")]
    {
        macos_bridge::island_preview_chime(&sound_id);
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = sound_id;
        Err("Dynamic Island is only available on macOS".into())
    }
}

#[tauri::command]
fn check_screen_recording_permissions() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(macos_bridge::check_screen_recording_permission())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(true) // On non-macOS systems, we don't need screen recording permissions
    }
}

#[tauri::command]
fn check_accessibility_permissions() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(macos_bridge::check_accessibility_permission())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(true) // On non-macOS systems, we don't need accessibility permissions
    }
}

#[tauri::command]
fn open_screen_recording_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_bridge::open_screen_recording_settings();
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Screen recording settings are only available on macOS".into())
    }
}

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_bridge::open_accessibility_settings();
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Accessibility settings are only available on macOS".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging (reads RUST_LOG env var)
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    log::info!("LeFocus starting up...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let result = (|| -> anyhow::Result<()> {
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|err| anyhow::anyhow!(err))?;
                std::fs::create_dir_all(&app_data_dir)?;

                let db_path = app_data_dir.join("lefocus.sqlite3");
                let database = Database::new(db_path)?;

                // Finalize timers that were running when the app last crashed.
                {
                    let db_for_recovery = database.clone();
                    tauri::async_runtime::block_on(async move {
                        if let Some(session) = db_for_recovery.get_incomplete_session().await? {
                            let now = Utc::now();
                            warn!(
                                "Recovered incomplete session {}; marking as Interrupted",
                                session.id
                            );
                            db_for_recovery
                                .mark_session_interrupted(&session.id, now)
                                .await?;
                        }
                        Ok::<(), anyhow::Error>(())
                    })?;
                }

                let timer_controller = TimerController::new(app.handle().clone(), database.clone());

                let settings_path = app_data_dir.join("settings.json");
                let settings_store = SettingsStore::new(settings_path)?;
                let initial_sound_settings = settings_store.island_sound();

                app.manage(AppState {
                    audio: AudioEngineHandle::new(),
                    db: database,
                    timer: timer_controller,
                    settings: settings_store,
                });

                // Initialize the island window on macOS to show "00:00" when idle
                #[cfg(target_os = "macos")]
                {
                    macos_bridge::set_app_handle(app.handle().clone());
                    macos_bridge::setup_timer_callbacks();
                    macos_bridge::island_init();
                    macos_bridge::audio_start_monitoring();
                    macos_bridge::island_update_chime_preferences(
                        initial_sound_settings.enabled,
                        &initial_sound_settings.sound_id,
                    );
                }

                Ok(())
            })();

            result.map_err(|err| err.into())
        })
        .invoke_handler(tauri::generate_handler![
            start_audio,
            stop_audio,
            toggle_pause,
            set_volume,
            test_get_window,
            test_capture_screenshot,
            test_run_ocr,
            get_timer_state,
            start_timer,
            end_timer,
            cancel_timer,
            get_segments_for_session,
            get_interruptions_for_segment,
            get_window_titles_for_segment,
            get_app_details_in_time_range,
            list_sessions,
            list_sessions_paginated,
            create_label,
            get_labels,
            update_label,
            delete_label,
            update_session_label,
            delete_session,
            get_island_sound_settings,
            set_island_sound_settings,
            preview_island_chime,
        // Permission checking commands
        check_screen_recording_permissions,
        check_accessibility_permissions,
        open_screen_recording_settings,
        open_accessibility_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
