#include "MacOSSensingFFI.h"

// Swift entry points (defined in FFIExports.swift)
extern CMacOSSensing_WindowMetadataFFI *macos_sensing_swift_get_window(void);
extern uint8_t *macos_sensing_swift_capture_screenshot(uint32_t window_id, size_t *out_len);
extern CMacOSSensing_OCRResultFFI *macos_sensing_swift_run_ocr(const uint8_t *image_data, size_t image_len);
extern void macos_sensing_swift_clear_cache(void);

extern void macos_sensing_swift_free_window_metadata(CMacOSSensing_WindowMetadataFFI *ptr);
extern void macos_sensing_swift_free_screenshot_buffer(uint8_t *ptr);
extern void macos_sensing_swift_free_ocr_result(CMacOSSensing_OCRResultFFI *ptr);

extern void macos_sensing_swift_island_init(void);
extern void macos_sensing_swift_island_start(int64_t start_uptime_ms, int64_t target_ms, const char *mode);
extern void macos_sensing_swift_island_sync(int64_t value_ms);
extern void macos_sensing_swift_island_reset(void);
extern void macos_sensing_swift_island_cleanup(void);
extern void macos_sensing_swift_island_update_chime_preferences(bool enabled, const char *sound_id);
extern void macos_sensing_swift_island_preview_chime(const char *sound_id);
extern void macos_sensing_swift_audio_start_monitoring(void);
extern void macos_sensing_swift_audio_toggle_playback(void);
extern void macos_sensing_swift_audio_next_track(void);
extern void macos_sensing_swift_audio_previous_track(void);

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

void macos_sensing_island_init(void) {
    macos_sensing_swift_island_init();
}

void macos_sensing_island_start(int64_t start_uptime_ms, int64_t target_ms, const char *mode) {
    macos_sensing_swift_island_start(start_uptime_ms, target_ms, mode);
}

void macos_sensing_island_sync(int64_t value_ms) {
    macos_sensing_swift_island_sync(value_ms);
}

void macos_sensing_island_reset(void) {
    macos_sensing_swift_island_reset();
}

void macos_sensing_island_cleanup(void) {
    macos_sensing_swift_island_cleanup();
}

void macos_sensing_island_update_chime_preferences(bool enabled, const char *sound_id) {
    macos_sensing_swift_island_update_chime_preferences(enabled, sound_id);
}

void macos_sensing_island_preview_chime(const char *sound_id) {
    macos_sensing_swift_island_preview_chime(sound_id);
}

void macos_sensing_audio_start_monitoring(void) {
    macos_sensing_swift_audio_start_monitoring();
}

void macos_sensing_audio_toggle_playback(void) {
    macos_sensing_swift_audio_toggle_playback();
}

void macos_sensing_audio_next_track(void) {
    macos_sensing_swift_audio_next_track();
}

void macos_sensing_audio_previous_track(void) {
    macos_sensing_swift_audio_previous_track();
}

// Timer control callbacks
static TimerEndCallback g_timer_end_callback = NULL;
static TimerCancelCallback g_timer_cancel_callback = NULL;
static FocusAppCallback g_focus_app_callback = NULL;

void macos_sensing_set_timer_end_callback(TimerEndCallback callback) {
    g_timer_end_callback = callback;
}

void macos_sensing_set_timer_cancel_callback(TimerCancelCallback callback) {
    g_timer_cancel_callback = callback;
}

void macos_sensing_set_focus_app_callback(FocusAppCallback callback) {
    g_focus_app_callback = callback;
}

void macos_sensing_trigger_end_timer(void) {
    if (g_timer_end_callback != NULL) {
        g_timer_end_callback();
    }
}

void macos_sensing_trigger_cancel_timer(void) {
    if (g_timer_cancel_callback != NULL) {
        g_timer_cancel_callback();
    }
}

void macos_sensing_trigger_focus_app(void) {
    if (g_focus_app_callback != NULL) {
        g_focus_app_callback();
    }
}
