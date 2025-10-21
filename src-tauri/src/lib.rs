mod audio;
mod macos_bridge;

use audio::AudioEngineHandle;
use macos_bridge::{
    capture_screenshot,
    get_active_window_metadata,
    run_ocr,
    OCRResult,
    WindowMetadata,
};
use tauri::State;

// Global audio engine state
struct AudioState {
    engine: AudioEngineHandle,
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
    state: State<AudioState>,
) -> Result<String, String> {
    // Initialize new audio engine and add the appropriate source
    state.engine.start()?;

    match sound_type {
        SoundType::Binaural => {
            let left = left_freq.unwrap_or(200.0);
            let right = right_freq.unwrap_or(204.0);
            state.engine.append_binaural(left, right)?;
        }
        SoundType::BrownNoise => {
            state.engine.append_brown_noise()?;
        }
        SoundType::Rain => {
            state.engine.append_rain()?;
        }
    }

    state.engine.play()?;

    Ok("Audio started".to_string())
}

#[tauri::command]
fn stop_audio(state: State<AudioState>) -> Result<String, String> {
    state.engine.stop()?;
    Ok("Audio stopped".to_string())
}

#[tauri::command]
fn toggle_pause(state: State<AudioState>) -> Result<bool, String> {
    let is_paused = state.engine.is_paused()?;

    if is_paused {
        state.engine.play()?;
        Ok(false) // Not paused anymore
    } else {
        state.engine.pause()?;
        Ok(true) // Now paused
    }
}

#[tauri::command]
fn set_volume(volume: f32, state: State<AudioState>) -> Result<String, String> {
    state.engine.set_volume(volume)?;
    Ok(format!("Volume set to {}", volume))
}

#[tauri::command]
fn test_get_window() -> Result<WindowMetadata, String> {
    get_active_window_metadata().map_err(|e| e.to_string())
}

#[tauri::command]
fn test_capture_screenshot(window_id: u32) -> Result<String, String> {
    let image_data = capture_screenshot(window_id)
        .map_err(|e| e.to_string())?;

    let output_path = std::path::Path::new("/tmp/lefocus_test_screenshot.png");
    std::fs::write(output_path, &image_data)
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "Screenshot saved to {} ({} bytes)",
        output_path.display(),
        image_data.len()
    ))
}

#[tauri::command]
fn test_run_ocr(image_path: String) -> Result<OCRResult, String> {
    let image_data = std::fs::read(&image_path)
        .map_err(|e| e.to_string())?;

    run_ocr(&image_data).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AudioState {
            engine: AudioEngineHandle::new(),
        })
        .invoke_handler(tauri::generate_handler![
            start_audio,
            stop_audio,
            toggle_pause,
            set_volume,
            test_get_window,
            test_capture_screenshot,
            test_run_ocr,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
