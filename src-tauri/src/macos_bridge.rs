use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::ffi::{c_char, CStr};

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

extern "C" {
    fn macos_sensing_get_active_window_metadata() -> *mut WindowMetadataFFI;
    fn macos_sensing_capture_screenshot(window_id: u32, out_length: *mut usize) -> *mut u8;
    fn macos_sensing_run_ocr(image_data: *const u8, image_length: usize) -> *mut OCRResultFFI;

    fn macos_sensing_free_window_metadata(ptr: *mut WindowMetadataFFI);
    fn macos_sensing_free_screenshot_buffer(ptr: *mut u8);
    fn macos_sensing_free_ocr_result(ptr: *mut OCRResultFFI);
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
