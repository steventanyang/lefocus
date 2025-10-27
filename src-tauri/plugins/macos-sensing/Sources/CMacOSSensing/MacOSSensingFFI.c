#include "MacOSSensingFFI.h"

// Swift entry points (defined in FFIExports.swift)
extern CMacOSSensing_WindowMetadataFFI *macos_sensing_swift_get_window(void);
extern uint8_t *macos_sensing_swift_capture_screenshot(uint32_t window_id, size_t *out_len);
extern CMacOSSensing_OCRResultFFI *macos_sensing_swift_run_ocr(const uint8_t *image_data, size_t image_len);
extern void macos_sensing_swift_clear_cache(void);

extern void macos_sensing_swift_free_window_metadata(CMacOSSensing_WindowMetadataFFI *ptr);
extern void macos_sensing_swift_free_screenshot_buffer(uint8_t *ptr);
extern void macos_sensing_swift_free_ocr_result(CMacOSSensing_OCRResultFFI *ptr);

CMacOSSensing_WindowMetadataFFI *macos_sensing_get_active_window_metadata(void) {
    return macos_sensing_swift_get_window();
}

uint8_t *macos_sensing_capture_screenshot(uint32_t window_id, size_t *out_len) {
    return macos_sensing_swift_capture_screenshot(window_id, out_len);
}

CMacOSSensing_OCRResultFFI *macos_sensing_run_ocr(const uint8_t *image_data, size_t image_len) {
    return macos_sensing_swift_run_ocr(image_data, image_len);
}

void macos_sensing_clear_cache(void) {
    macos_sensing_swift_clear_cache();
}

void macos_sensing_free_window_metadata(CMacOSSensing_WindowMetadataFFI *ptr) {
    macos_sensing_swift_free_window_metadata(ptr);
}

void macos_sensing_free_screenshot_buffer(uint8_t *ptr) {
    macos_sensing_swift_free_screenshot_buffer(ptr);
}

void macos_sensing_free_ocr_result(CMacOSSensing_OCRResultFFI *ptr) {
    macos_sensing_swift_free_ocr_result(ptr);
}
