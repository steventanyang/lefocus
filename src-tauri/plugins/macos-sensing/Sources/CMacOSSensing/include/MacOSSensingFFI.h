#pragma once

#include <stddef.h>
#include <stdint.h>

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
void macos_sensing_island_pause(void);
void macos_sensing_island_resume(void);
void macos_sensing_island_reset(void);
void macos_sensing_island_cleanup(void);
