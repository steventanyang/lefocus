#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

typedef struct {
    uint32_t windowId;
    char *bundleIdPtr;
    char *titlePtr;
    char *ownerNamePtr;
    double boundsX;
    double boundsY;
    double boundsWidth;
    double boundsHeight;
} CMacOSSensing_WindowMetadataFFI;

typedef struct {
    char *textPtr;
    double confidence;
    uint64_t wordCount;
} CMacOSSensing_OCRResultFFI;

CMacOSSensing_WindowMetadataFFI *macos_sensing_get_active_window_metadata(void);
uint8_t *macos_sensing_capture_screenshot(uint32_t window_id, size_t *out_len);
CMacOSSensing_OCRResultFFI *macos_sensing_run_ocr(const uint8_t *image_data, size_t image_len);
void macos_sensing_clear_cache(void);

void macos_sensing_free_window_metadata(CMacOSSensing_WindowMetadataFFI *ptr);
void macos_sensing_free_screenshot_buffer(uint8_t *ptr);
void macos_sensing_free_ocr_result(CMacOSSensing_OCRResultFFI *ptr);

// Island controls
void macos_sensing_island_init(void);
void macos_sensing_island_start(int64_t start_uptime_ms, int64_t target_ms, const char *mode);
void macos_sensing_island_sync(int64_t value_ms);
void macos_sensing_island_reset(void);
void macos_sensing_island_cleanup(void);
void macos_sensing_island_update_chime_preferences(bool enabled, const char *sound_id);
void macos_sensing_island_preview_chime(const char *sound_id);
void macos_sensing_island_set_visible(bool visible);

// Audio monitoring/control
void macos_sensing_audio_start_monitoring(void);
void macos_sensing_audio_toggle_playback(void);
void macos_sensing_audio_next_track(void);
void macos_sensing_audio_previous_track(void);

// Permission checking
bool macos_sensing_check_screen_recording_permission(void);
bool macos_sensing_request_screen_recording_permission(void);
bool macos_sensing_check_accessibility_permission(void);
void macos_sensing_open_screen_recording_settings(void);
void macos_sensing_open_accessibility_settings(void);
bool macos_sensing_check_media_automation_permission(const char *bundle_id);
int32_t macos_sensing_request_media_automation_permission(const char *bundle_id);
void macos_sensing_open_automation_settings(void);

// Timer control callback types
typedef void (*TimerEndCallback)(void);
typedef void (*TimerCancelCallback)(void);
typedef void (*FocusAppCallback)(void);

// Rust sets these callbacks
void macos_sensing_set_timer_end_callback(TimerEndCallback callback);
void macos_sensing_set_timer_cancel_callback(TimerCancelCallback callback);
void macos_sensing_set_focus_app_callback(FocusAppCallback callback);

// Swift calls these to trigger Rust actions
void macos_sensing_trigger_end_timer(void);
void macos_sensing_trigger_cancel_timer(void);
void macos_sensing_trigger_focus_app(void);
