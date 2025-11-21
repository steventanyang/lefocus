use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json;
use std::ffi::{c_char, CStr, CString};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn set_app_handle(handle: AppHandle) {
    APP_HANDLE
        .set(handle)
        .expect("set_app_handle called twice; this indicates a bug in initialization");
}

fn get_app_handle() -> Option<&'static AppHandle> {
    APP_HANDLE.get()
}

#[repr(C)]
struct WindowMetadataFFI {
    window_id: u32,
    bundle_id_ptr: *mut c_char,
    title_ptr: *mut c_char,
    owner_name_ptr: *mut c_char,
    bounds_x: f64,
    bounds_y: f64,
    bounds_width: f64,
    bounds_height: f64,
}

#[repr(C)]
struct OCRResultFFI {
    text_ptr: *mut c_char,
    confidence: f64,
    word_count: u64,
}

#[allow(dead_code)]
extern "C" {
    fn macos_sensing_get_active_window_metadata() -> *mut WindowMetadataFFI;
    fn macos_sensing_capture_screenshot(window_id: u32, out_length: *mut usize) -> *mut u8;
    fn macos_sensing_run_ocr(image_data: *const u8, image_length: usize) -> *mut OCRResultFFI;
    fn macos_sensing_clear_cache();

    fn macos_sensing_free_window_metadata(ptr: *mut WindowMetadataFFI);
    fn macos_sensing_free_screenshot_buffer(ptr: *mut u8);
    fn macos_sensing_free_ocr_result(ptr: *mut OCRResultFFI);

    fn macos_sensing_island_init();
    fn macos_sensing_island_start(start_uptime_ms: i64, target_ms: i64, mode: *const c_char);
    fn macos_sensing_island_sync(value_ms: i64);
    fn macos_sensing_island_reset();
    fn macos_sensing_island_cleanup();
    fn macos_sensing_audio_start_monitoring();
    fn macos_sensing_audio_toggle_playback();
    fn macos_sensing_audio_next_track();
    fn macos_sensing_audio_previous_track();
    fn macos_sensing_island_update_chime_preferences(enabled: bool, sound_id: *const c_char);
    fn macos_sensing_island_preview_chime(sound_id: *const c_char);

    fn macos_sensing_set_timer_end_callback(callback: extern "C" fn());
    fn macos_sensing_set_timer_cancel_callback(callback: extern "C" fn());
    fn macos_sensing_set_focus_app_callback(callback: extern "C" fn());

    // App icon fetching
    // fn macos_sensing_swift_get_app_icon(bundle_id: *const c_char) -> *mut c_char; // Unused - replaced by get_app_icon_and_color
    fn macos_sensing_swift_get_app_icon_and_color(bundle_id: *const c_char) -> *mut c_char;
    fn macos_sensing_swift_free_string(ptr: *mut c_char);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowMetadata {
    pub window_id: u32,
    pub bundle_id: String,
    pub title: String,
    pub owner_name: String,
    pub bounds: WindowBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCRResult {
    pub text: String,
    pub confidence: f64,
    pub word_count: u64,
}

pub fn get_active_window_metadata() -> Result<WindowMetadata> {
    unsafe {
        let ptr = macos_sensing_get_active_window_metadata();
        if ptr.is_null() {
            bail!("Swift returned null window metadata pointer");
        }

        let ffi_data = &*ptr;
        let metadata = WindowMetadata {
            window_id: ffi_data.window_id,
            bundle_id: c_ptr_to_string(ffi_data.bundle_id_ptr)
                .context("Failed to decode bundle ID")?,
            title: c_ptr_to_string(ffi_data.title_ptr).context("Failed to decode window title")?,
            owner_name: c_ptr_to_string(ffi_data.owner_name_ptr)
                .context("Failed to decode owner name")?,
            bounds: WindowBounds {
                x: ffi_data.bounds_x,
                y: ffi_data.bounds_y,
                width: ffi_data.bounds_width,
                height: ffi_data.bounds_height,
            },
        };

        macos_sensing_free_window_metadata(ptr);
        Ok(metadata)
    }
}

pub fn capture_screenshot(window_id: u32) -> Result<Vec<u8>> {
    unsafe {
        let mut length: usize = 0;
        let ptr = macos_sensing_capture_screenshot(window_id, &mut length as *mut usize);

        if ptr.is_null() || length == 0 {
            bail!("Swift returned empty screenshot buffer");
        }

        let slice = std::slice::from_raw_parts(ptr, length);
        let data = slice.to_vec();
        macos_sensing_free_screenshot_buffer(ptr);

        Ok(data)
    }
}

pub fn run_ocr(image_data: &[u8]) -> Result<OCRResult> {
    unsafe {
        let ptr = macos_sensing_run_ocr(image_data.as_ptr(), image_data.len());
        if ptr.is_null() {
            bail!("Swift returned null OCR result pointer");
        }

        let ffi_data = &*ptr;
        let text = c_ptr_to_string(ffi_data.text_ptr).context("Failed to decode OCR text")?;
        let result = OCRResult {
            text,
            confidence: ffi_data.confidence,
            word_count: ffi_data.word_count,
        };

        macos_sensing_free_ocr_result(ptr);
        Ok(result)
    }
}

pub fn clear_cache() {
    unsafe {
        macos_sensing_clear_cache();
    }
}

pub fn island_init() {
    unsafe {
        macos_sensing_island_init();
    }
}

pub fn island_start(start_uptime_ms: i64, target_ms: i64, mode: &str) {
    unsafe {
        let c_mode = CString::new(mode).expect("island mode string contains interior null byte");
        macos_sensing_island_start(start_uptime_ms, target_ms, c_mode.as_ptr());
    }
}

pub fn island_sync(value_ms: i64) {
    unsafe {
        macos_sensing_island_sync(value_ms);
    }
}

pub fn island_reset() {
    unsafe {
        macos_sensing_island_reset();
    }
}

#[allow(dead_code)]
pub fn island_cleanup() {
    unsafe {
        macos_sensing_island_cleanup();
    }
}

pub fn audio_start_monitoring() {
    unsafe {
        macos_sensing_audio_start_monitoring();
    }
}

#[cfg(target_os = "macos")]
pub fn island_update_chime_preferences(enabled: bool, sound_id: &str) {
    unsafe {
        if let Ok(c_sound_id) = CString::new(sound_id) {
            macos_sensing_island_update_chime_preferences(enabled, c_sound_id.as_ptr());
        } else {
            log::warn!(
                "island_update_chime_preferences: sound_id contains null byte; skipping update"
            );
        }
    }
}

#[cfg(target_os = "macos")]
pub fn island_preview_chime(sound_id: &str) {
    unsafe {
        if let Ok(c_sound_id) = CString::new(sound_id) {
            macos_sensing_island_preview_chime(c_sound_id.as_ptr());
        } else {
            log::warn!("island_preview_chime: sound_id contains null byte; skipping preview");
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn island_update_chime_preferences(_enabled: bool, _sound_id: &str) {}

#[cfg(not(target_os = "macos"))]
pub fn island_preview_chime(_sound_id: &str) {}

// NOTE: These functions are currently unused as media playback is controlled directly
// through the Island UI in Swift. In the future, we can expose these as Tauri commands
// to allow the frontend to control media playback programmatically.
//
// To enable frontend control, add Tauri commands like:
// #[tauri::command]
// fn media_toggle_playback() { audio_toggle_playback(); }
//
// pub fn audio_toggle_playback() {
//     unsafe {
//         macos_sensing_audio_toggle_playback();
//     }
// }
//
// pub fn audio_next_track() {
//     unsafe {
//         macos_sensing_audio_next_track();
//     }
// }
//
// pub fn audio_previous_track() {
//     unsafe {
//         macos_sensing_audio_previous_track();
//     }
// }

pub fn handle_island_end_timer() {
    if let Some(app_handle) = get_app_handle() {
        if let Some(state) = app_handle.try_state::<crate::AppState>() {
            let timer = state.timer.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = timer.end_timer().await {
                    log::error!("Failed to end timer from island: {}", e);
                }
            });
        } else {
            log::error!("Failed to get app state when ending timer from island");
        }
    } else {
        log::error!("Failed to get app handle when ending timer from island");
    }
}

pub fn handle_island_cancel_timer() {
    if let Some(app_handle) = get_app_handle() {
        if let Some(state) = app_handle.try_state::<crate::AppState>() {
            let timer = state.timer.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = timer.cancel_timer().await {
                    log::error!("Failed to cancel timer from island: {}", e);
                }
            });
        } else {
            log::error!("Failed to get app state when canceling timer from island");
        }
    } else {
        log::error!("Failed to get app handle when canceling timer from island");
    }
}

#[cfg(target_os = "macos")]
pub fn current_uptime_ms() -> i64 {
    use mach::mach_time::{mach_absolute_time, mach_timebase_info, mach_timebase_info_data_t};
    use std::mem::MaybeUninit;

    unsafe {
        let now = mach_absolute_time();
        let mut info = MaybeUninit::<mach_timebase_info_data_t>::uninit();
        mach_timebase_info(info.as_mut_ptr());
        let info = info.assume_init();
        ((now as u128 * info.numer as u128) / info.denom as u128 / 1_000_000) as i64
    }
}

unsafe fn c_ptr_to_string(ptr: *mut c_char) -> Result<String> {
    if ptr.is_null() {
        return Ok(String::new());
    }

    let c_str = CStr::from_ptr(ptr);
    Ok(c_str
        .to_str()
        .map(|s| s.to_owned())
        .map_err(|e| anyhow!(e))?)
}

// Callback functions that will be registered with C layer
extern "C" fn rust_timer_end_callback() {
    handle_island_end_timer();
}

extern "C" fn rust_timer_cancel_callback() {
    handle_island_cancel_timer();
}

extern "C" fn rust_focus_app_callback() {
    focus_main_window();
}

// Initialize timer callbacks
pub fn setup_timer_callbacks() {
    unsafe {
        macos_sensing_set_timer_end_callback(rust_timer_end_callback);
        macos_sensing_set_timer_cancel_callback(rust_timer_cancel_callback);
        macos_sensing_set_focus_app_callback(rust_focus_app_callback);
    }
}

fn focus_main_window() {
    if let Some(app_handle) = get_app_handle() {
        match app_handle.get_webview_window("main") {
            Some(window) => {
                if let Err(e) = window.show() {
                    log::error!("Failed to show main window: {}", e);
                }
                if let Err(e) = window.unminimize() {
                    log::warn!("Failed to unminimize main window: {}", e);
                }
                if let Err(e) = window.set_focus() {
                    log::error!("Failed to focus main window: {}", e);
                }
            }
            None => {
                log::error!("Main window not found when attempting to focus app");
            }
        }
    } else {
        log::error!("Failed to get app handle when focusing main window");
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IconAndColor {
    icon: String,
    color: String,
}

// Unused - replaced by get_app_icon_and_color() which also extracts dominant color
// /// Get app icon as base64-encoded PNG data URL
// /// Returns None if the app is not found or icon cannot be fetched
// pub fn get_app_icon_data(bundle_id: &str) -> Option<String> {
//     unsafe {
//         let c_bundle_id = CString::new(bundle_id).ok()?;
//         let ptr = macos_sensing_swift_get_app_icon(c_bundle_id.as_ptr());
//
//         if ptr.is_null() {
//             return None;
//         }
//
//         let c_str = CStr::from_ptr(ptr);
//         let result = c_str.to_str().ok().map(String::from);
//
//         macos_sensing_swift_free_string(ptr);
//
//         result
//     }
// }

/// Get app icon and dominant color
/// Returns tuple of (icon_data_url, icon_color) where color may be empty string if extraction failed
pub fn get_app_icon_and_color(bundle_id: &str) -> Option<(String, String)> {
    unsafe {
        let c_bundle_id = CString::new(bundle_id).ok()?;
        let ptr = macos_sensing_swift_get_app_icon_and_color(c_bundle_id.as_ptr());

        if ptr.is_null() {
            return None;
        }

        let c_str = CStr::from_ptr(ptr);
        let json_str = c_str.to_str().ok()?;

        // Parse JSON response
        let icon_and_color: IconAndColor = match serde_json::from_str(json_str) {
            Ok(data) => data,
            Err(_) => {
                macos_sensing_swift_free_string(ptr);
                return None;
            }
        };

        macos_sensing_swift_free_string(ptr);

        Some((icon_and_color.icon, icon_and_color.color))
    }
}
