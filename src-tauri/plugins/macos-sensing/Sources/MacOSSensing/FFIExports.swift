
import Foundation
import Cocoa

@_cdecl("macos_sensing_swift_get_window")
public func macos_sensing_swift_get_window() -> UnsafeMutablePointer<WindowMetadataFFI>? {
    var metadata: WindowMetadataFFI?
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
        defer { semaphore.signal() }
        do {
            metadata = try await MacOSSensingPlugin.shared.getActiveWindowMetadata()
        } catch {
            metadata = nil
        }
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut {
        return nil
    }

    guard let result = metadata else {
        return nil
    }

    let pointer = UnsafeMutablePointer<WindowMetadataFFI>.allocate(capacity: 1)
    pointer.pointee = result
    return pointer
}

@_cdecl("macos_sensing_swift_free_window_metadata")
public func macos_sensing_swift_free_window_metadata(_ pointer: UnsafeMutablePointer<WindowMetadataFFI>) {
    if let bundleId = pointer.pointee.bundleIdPtr {
        free(bundleId)
    }
    if let title = pointer.pointee.titlePtr {
        free(title)
    }
    if let owner = pointer.pointee.ownerNamePtr {
        free(owner)
    }
    pointer.deallocate()
}

// MARK: - Agent session monitoring bridge

@_cdecl("macos_sensing_swift_island_update_agent_sessions")
public func macos_sensing_swift_island_update_agent_sessions(
    _ sessions: UnsafePointer<AgentSessionFFI>,
    _ count: Int
) {
    var parsed: [AgentSessionInfo] = []
    parsed.reserveCapacity(count)
    for i in 0..<count {
        let raw = sessions[i]
        let state = AgentSessionState(rawValue: raw.state) ?? .thinking
        parsed.append(AgentSessionInfo(pid: raw.pid, state: state, ageSeconds: raw.age_secs))
    }
    if !parsed.isEmpty {
        NSLog("[IslandAgent] FFI received %d sessions", parsed.count)
    }
    DispatchQueue.main.async {
        IslandController.shared.updateAgentSessions(parsed)
    }
}

// MARK: - Island bridge

@_cdecl("macos_sensing_swift_island_init")
public func macos_sensing_swift_island_init() {
    DispatchQueue.main.async {
        IslandController.shared.initialize()
    }
}

@_cdecl("macos_sensing_swift_island_start")
public func macos_sensing_swift_island_start(
    _ startUptimeMs: Int64,
    _ targetMs: Int64,
    _ modePtr: UnsafePointer<CChar>
) {
    let modeString = String(cString: modePtr)
    let islandMode = IslandMode(rawValue: modeString) ?? .countdown
    let payload = IslandStartPayload(startUptimeMs: startUptimeMs, targetMs: targetMs, mode: islandMode)

    DispatchQueue.main.async {
        IslandController.shared.start(payload: payload)
    }
}

@_cdecl("macos_sensing_swift_island_sync")
public func macos_sensing_swift_island_sync(_ valueMs: Int64) {
    DispatchQueue.main.async {
        IslandController.shared.sync(authoritativeMs: valueMs)
    }
}

@_cdecl("macos_sensing_swift_island_reset")
public func macos_sensing_swift_island_reset() {
    DispatchQueue.main.async {
        IslandController.shared.reset()
    }
}

@_cdecl("macos_sensing_swift_island_cleanup")
public func macos_sensing_swift_island_cleanup() {
    IslandController.shared.cleanup()
}

@_cdecl("macos_sensing_swift_island_update_chime_preferences")
public func macos_sensing_swift_island_update_chime_preferences(
    _ enabled: Bool,
    _ soundPtr: UnsafePointer<CChar>
) {
    let soundID = String(cString: soundPtr)
    DispatchQueue.main.async {
        let prefs = IslandSoundPreferences(enabled: enabled, soundID: soundID)
        IslandChimePlayer.shared.updatePreferences(prefs)
    }
}

@_cdecl("macos_sensing_swift_island_preview_chime")
public func macos_sensing_swift_island_preview_chime(_ soundPtr: UnsafePointer<CChar>) {
    let soundID = String(cString: soundPtr)
    DispatchQueue.main.async {
        IslandChimePlayer.shared.playPreview(soundID: soundID)
    }
}

@_cdecl("macos_sensing_swift_island_set_visible")
public func macos_sensing_swift_island_set_visible(_ visible: Bool) {
    DispatchQueue.main.async {
        IslandController.shared.setVisible(visible)
    }
}

// MARK: - Audio controls bridge

@_cdecl("macos_sensing_swift_audio_start_monitoring")
public func macos_sensing_swift_audio_start_monitoring() {
    DispatchQueue.main.async {
        MediaMonitor.shared.startMonitoring()
    }
}

@_cdecl("macos_sensing_swift_audio_toggle_playback")
public func macos_sensing_swift_audio_toggle_playback() {
    DispatchQueue.main.async {
        MediaMonitor.shared.togglePlayback()
    }
}

@_cdecl("macos_sensing_swift_audio_next_track")
public func macos_sensing_swift_audio_next_track() {
    DispatchQueue.main.async {
        MediaMonitor.shared.skipToNext()
    }
}

@_cdecl("macos_sensing_swift_audio_previous_track")
public func macos_sensing_swift_audio_previous_track() {
    DispatchQueue.main.async {
        MediaMonitor.shared.skipToPrevious()
    }
}
