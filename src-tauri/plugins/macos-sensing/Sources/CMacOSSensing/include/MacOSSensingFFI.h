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

CMacOSSensing_WindowMetadataFFI *macos_sensing_get_active_window_metadata(void);

void macos_sensing_free_window_metadata(CMacOSSensing_WindowMetadataFFI *ptr);

// Agent session monitoring
typedef struct {
    uint32_t pid;
    uint8_t state;    // 0=Thinking, 1=Executing, 2=Waiting, 3=Done
    float age_secs;
} CMacOSSensing_AgentSessionFFI;

void macos_sensing_island_update_agent_sessions(const CMacOSSensing_AgentSessionFFI *sessions, size_t count);

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
