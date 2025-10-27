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
