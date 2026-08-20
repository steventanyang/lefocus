mod agent_monitor;
mod audio;
mod db;
mod labels;
mod macos_bridge;
mod metrics;
mod segmentation;
mod sensing;
mod settings;
mod storage_compaction;
mod timer;
mod utils;

use audio::AudioEngineHandle;
use db::Database;
use labels::commands::{
    create_label, delete_label, get_labels, update_label, update_session_label,
};
use log::warn;
use macos_bridge::{get_active_window_metadata, WindowMetadata};
use metrics::{MetricsCollector, MetricsSnapshot};
use settings::{IslandSoundSettings, SettingsStore};
use std::{env, process::Command};

use tauri::{Emitter, Manager, State};
use timer::{
    commands::{
        cancel_timer, delete_session, end_timer, get_app_sessions_in_time_range,
        get_daily_activity_in_time_range, get_interruptions_for_segment, get_segments_for_session,
        get_stats_in_time_range, get_timer_state, get_window_titles_for_segment, list_sessions,
        list_sessions_paginated, start_timer,
    },
    TimerController,
};

pub(crate) struct AppState {
    audio: AudioEngineHandle,
    pub(crate) db: Database,
    pub(crate) timer: TimerController,
    pub(crate) settings: SettingsStore,
    pub(crate) metrics: MetricsCollector,
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
fn preview_island_chime(
    sound_id: Option<String>,
    sound_id_camel: Option<String>,
) -> Result<(), String> {
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
fn get_island_visible(state: State<AppState>) -> Result<bool, String> {
    Ok(state.settings.island_visible())
}

#[tauri::command]
fn set_island_visible(
    visible: bool,
    state: State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state
        .settings
        .update_island_visible(visible)
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        macos_bridge::island_set_visible(visible);
    }

    app_handle
        .emit("island-visible-updated", visible)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_island_agent_tracking(state: State<AppState>) -> Result<bool, String> {
    Ok(state.settings.island_agent_tracking_enabled())
}

#[tauri::command]
fn set_island_agent_tracking(
    enabled: bool,
    state: State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state
        .settings
        .update_island_agent_tracking_enabled(enabled)
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    if !enabled {
        macos_bridge::island_update_agent_sessions(&[]);
    }

    app_handle
        .emit("island-agent-tracking-updated", enabled)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn restart_app_instance(app_handle: tauri::AppHandle) -> Result<(), String> {
    let current_exe =
        env::current_exe().map_err(|e| format!("Failed to locate executable: {e}"))?;

    Command::new(&current_exe)
        .spawn()
        .map_err(|e| format!("Failed to relaunch Pomodoro: {e}"))?;

    app_handle.exit(0);
    Ok(())
}

#[tauri::command]
async fn get_metrics_snapshot(state: State<'_, AppState>) -> Result<MetricsSnapshot, String> {
    Ok(state.metrics.get_snapshot().await)
}

/// Recovery tool for a verified archive. Normal UI queries use activity runs and
/// do not need to expand raw readings.
#[tauri::command]
async fn restore_session_readings(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    storage_compaction::restore_session_readings(&state.db, &session_id)
        .await
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging (reads RUST_LOG env var)
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    log::info!("Pomodoro starting up...");

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
                        for session in db_for_recovery.get_incomplete_sessions().await? {
                            // The last heartbeat is the last duration we durably observed;
                            // charging sleep/crash downtime to the session would inflate it.
                            let stopped_at = session.updated_at;
                            warn!(
                                "Recovering incomplete session {}; marking as Interrupted",
                                session.id
                            );

                            let recovery_result = async {
                                use crate::segmentation::{segment_session, SegmentationConfig};
                                let readings = db_for_recovery
                                    .get_context_readings_for_session(&session.id)
                                    .await?;
                                let (segments, interruptions) =
                                    segment_session(readings, &SegmentationConfig::default())?;
                                db_for_recovery
                                    .insert_segments_and_interruptions(
                                        &session.id,
                                        &segments,
                                        &interruptions,
                                    )
                                    .await?;
                                let ranges = segments
                                    .iter()
                                    .map(|segment| {
                                        (segment.id.clone(), segment.start_time, segment.end_time)
                                    })
                                    .collect::<Vec<_>>();
                                db_for_recovery
                                    .update_readings_with_segment_ids(&session.id, &ranges)
                                    .await?;
                                storage_compaction::generate_and_store_runs(
                                    &db_for_recovery,
                                    &session.id,
                                )
                                .await?;
                                Ok::<(), anyhow::Error>(())
                            }
                            .await;
                            if let Err(error) = recovery_result {
                                log::error!(
                                    "Failed to rebuild activity blocks for recovered session {}: {}",
                                    session.id,
                                    error
                                );
                            }
                            db_for_recovery
                                .mark_session_interrupted(&session.id, stopped_at)
                                .await?;
                        }
                        Ok::<(), anyhow::Error>(())
                    })?;
                }

                let metrics_collector = MetricsCollector::new();
                let timer_controller = TimerController::new(
                    app.handle().clone(),
                    database.clone(),
                    metrics_collector.clone(),
                );
                let archive_db = database.clone();
                let archive_timer = timer_controller.clone();

                let settings_path = app_data_dir.join("settings.json");
                let settings_store = SettingsStore::new(settings_path)?;
                let initial_sound_settings = settings_store.island_sound();

                app.manage(AppState {
                    audio: AudioEngineHandle::new(),
                    db: database,
                    timer: timer_controller,
                    settings: settings_store,
                    metrics: metrics_collector,
                });

                // Archive only while idle. Each batch is bounded, and CPU-heavy
                // compression is dispatched through spawn_blocking.
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                    loop {
                        let mut continue_soon = false;
                        if archive_timer.get_state().await.status == timer::TimerStatus::Idle {
                            match archive_db.archive_candidates(10).await {
                                Ok(candidates) => {
                                    let full_batch = candidates.len() == 10;
                                    let mut archived = 0_usize;
                                    for session_id in candidates {
                                        if archive_timer.get_state().await.status
                                            != timer::TimerStatus::Idle
                                        {
                                            break;
                                        }
                                        match storage_compaction::archive_session(
                                            &archive_db,
                                            &session_id,
                                        )
                                        .await
                                        {
                                            Ok(()) => {
                                                archived += 1;
                                                log::info!(
                                                    "Archived readings for session {session_id}"
                                                )
                                            }
                                            Err(error) => log::error!(
                                                "Skipping archive for session {session_id}: {error:#}"
                                            ),
                                        }
                                        tokio::time::sleep(std::time::Duration::from_millis(250))
                                            .await;
                                    }
                                    if let Err(error) = archive_db
                                        .mark_legacy_vacuum_pending_if_complete()
                                        .await
                                    {
                                        log::error!("Could not schedule database compaction: {error:#}");
                                    }
                                    continue_soon = full_batch && archived > 0;
                                }
                                Err(error) => log::error!("Reading archive job failed: {error:#}"),
                            }
                        }
                        tokio::time::sleep(std::time::Duration::from_secs(if continue_soon {
                            1
                        } else {
                            300
                        }))
                        .await;
                    }
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

                    // Set white title bar background (via AppKit to avoid Tauri color-inversion bug)
                    if let Some(main_window) = app.get_webview_window("main") {
                        use objc2_app_kit::{NSColor, NSWindow};
                        let ns_window_ptr = main_window.ns_window().unwrap() as *mut NSWindow;
                        unsafe {
                            if let Some(ns_window) = ns_window_ptr.as_ref() {
                                let bg_color =
                                    NSColor::colorWithRed_green_blue_alpha(1.0, 1.0, 1.0, 1.0);
                                ns_window.setBackgroundColor(Some(&*bg_color));
                            }
                        }
                    }

                    // Spawn background task to monitor agent terminal sessions
                    let app_handle_for_agents = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        let mut monitor = agent_monitor::AgentMonitor::new();
                        loop {
                            let enabled = app_handle_for_agents
                                .try_state::<AppState>()
                                .map(|s| s.settings.island_agent_tracking_enabled())
                                .unwrap_or(true);
                            if enabled {
                                let sessions = monitor.poll();
                                macos_bridge::island_update_agent_sessions(&sessions);
                            } else {
                                macos_bridge::island_update_agent_sessions(&[]);
                            }
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        }
                    });
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
            get_timer_state,
            start_timer,
            end_timer,
            cancel_timer,
            get_segments_for_session,
            get_stats_in_time_range,
            get_daily_activity_in_time_range,
            get_interruptions_for_segment,
            get_window_titles_for_segment,
            get_app_sessions_in_time_range,
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
            get_island_visible,
            set_island_visible,
            get_island_agent_tracking,
            set_island_agent_tracking,
            restart_app_instance,
            get_metrics_snapshot,
            restore_session_readings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
