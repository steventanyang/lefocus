
import Foundation
import ApplicationServices
import Cocoa
import Carbon

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

@_cdecl("macos_sensing_swift_capture_screenshot")
public func macos_sensing_swift_capture_screenshot(
    _ windowId: UInt32,
    _ outLength: UnsafeMutablePointer<Int>
) -> UnsafeMutablePointer<UInt8>? {
    var data: Data?
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
        defer { semaphore.signal() }
        do {
            data = try await MacOSSensingPlugin.shared.captureScreenshot(windowId: windowId)
        } catch {
            data = nil
            print("Screenshot capture error: \(error)")
        }
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut {
        outLength.pointee = 0
        return nil
    }

    guard let bufferData = data else {
        outLength.pointee = 0
        return nil
    }

    outLength.pointee = bufferData.count
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferData.count)
    bufferData.copyBytes(to: buffer, count: bufferData.count)
    return buffer
}

@_cdecl("macos_sensing_swift_run_ocr")
public func macos_sensing_swift_run_ocr(
    _ imageData: UnsafePointer<UInt8>,
    _ imageLength: Int
) -> UnsafeMutablePointer<OCRResultFFI>? {
    let bytes = Data(bytes: imageData, count: imageLength)
    let resultPointer = UnsafeMutablePointer<OCRResultFFI>.allocate(capacity: 1)
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
        defer { semaphore.signal() }
        do {
            let ocrResult = try await MacOSSensingPlugin.shared.runOCR(imageData: bytes)
            resultPointer.pointee = ocrResult
        } catch {
            print("OCR error: \(error)")
            resultPointer.pointee = OCRResultFFI(
                textPtr: strdup(""),
                confidence: 0.0,
                wordCount: 0
            )
        }
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut {
        resultPointer.pointee = OCRResultFFI(
            textPtr: strdup(""),
            confidence: 0.0,
            wordCount: 0
        )
    }

    return resultPointer
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

@_cdecl("macos_sensing_swift_clear_cache")
public func macos_sensing_swift_clear_cache() {
    MacOSSensingPlugin.shared.clearCache()
}

@_cdecl("macos_sensing_swift_free_screenshot_buffer")
public func macos_sensing_swift_free_screenshot_buffer(_ pointer: UnsafeMutablePointer<UInt8>) {
    pointer.deallocate()
}

@_cdecl("macos_sensing_swift_free_ocr_result")
public func macos_sensing_swift_free_ocr_result(_ pointer: UnsafeMutablePointer<OCRResultFFI>) {
    if let text = pointer.pointee.textPtr {
        free(text)
    }
    pointer.deallocate()
}

// MARK: - Claude session monitoring bridge

@_cdecl("macos_sensing_swift_island_update_claude_sessions")
public func macos_sensing_swift_island_update_claude_sessions(
    _ sessions: UnsafePointer<ClaudeSessionFFI>,
    _ count: Int
) {
    var parsed: [ClaudeSessionInfo] = []
    parsed.reserveCapacity(count)
    for i in 0..<count {
        let raw = sessions[i]
        let state = ClaudeSessionState(rawValue: raw.state) ?? .thinking
        parsed.append(ClaudeSessionInfo(pid: raw.pid, state: state, ageSeconds: raw.age_secs))
    }
    if !parsed.isEmpty {
        NSLog("[IslandClaude] FFI received %d sessions", parsed.count)
    }
    DispatchQueue.main.async {
        IslandController.shared.updateClaudeSessions(parsed)
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

// MARK: - Permission checking bridge

@_cdecl("macos_sensing_swift_check_screen_recording_permission")
public func macos_sensing_swift_check_screen_recording_permission() -> Bool {
    return CGPreflightScreenCaptureAccess()
}

@_cdecl("macos_sensing_swift_request_screen_recording_permission")
public func macos_sensing_swift_request_screen_recording_permission() -> Bool {
    return CGRequestScreenCaptureAccess()
}

@_cdecl("macos_sensing_swift_check_accessibility_permission")
public func macos_sensing_swift_check_accessibility_permission() -> Bool {
    return AXIsProcessTrusted()
}

@_cdecl("macos_sensing_swift_open_screen_recording_settings")
public func macos_sensing_swift_open_screen_recording_settings() {
    let screenCaptureURL = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!
    NSWorkspace.shared.open(screenCaptureURL)
}

@_cdecl("macos_sensing_swift_open_accessibility_settings")
public func macos_sensing_swift_open_accessibility_settings() {
    let accessibilityURL = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!
    NSWorkspace.shared.open(accessibilityURL)
}

// MARK: - Media automation permissions

private enum AutomationPermission {
    static func determineStatus(for bundleID: String, askIfNeeded: Bool) -> OSStatus {
        guard !bundleID.isEmpty, let data = bundleID.data(using: .utf8) else {
            return OSStatus(paramErr)
        }

        var target = AEAddressDesc()
        let status = data.withUnsafeBytes { bytes -> OSStatus in
            guard let base = bytes.baseAddress else {
                return OSStatus(errAECoercionFail)
            }
            return OSStatus(
                AECreateDesc(DescType(typeApplicationBundleID), base, data.count, &target)
            )
        }

        guard status == noErr else {
            return status
        }

        defer {
            AEDisposeDesc(&target)
        }

        return AEDeterminePermissionToAutomateTarget(
            &target,
            AEEventClass(typeWildCard),
            AEEventID(typeWildCard),
            askIfNeeded ? true : false
        )
    }

    static func hasPermission(for bundleID: String) -> Bool {
        determineStatus(for: bundleID, askIfNeeded: false) == noErr
    }
}

@_cdecl("macos_sensing_swift_check_media_automation_permission")
public func macos_sensing_swift_check_media_automation_permission(_ bundlePtr: UnsafePointer<CChar>) -> Bool {
    let bundleID = String(cString: bundlePtr)
    return AutomationPermission.hasPermission(for: bundleID)
}

@_cdecl("macos_sensing_swift_request_media_automation_permission")
public func macos_sensing_swift_request_media_automation_permission(_ bundlePtr: UnsafePointer<CChar>) -> Int32 {
    let bundleID = String(cString: bundlePtr)
    let status = AutomationPermission.determineStatus(for: bundleID, askIfNeeded: true)
    return Int32(status)
}

@_cdecl("macos_sensing_swift_open_automation_settings")
public func macos_sensing_swift_open_automation_settings() {
    let automationURL = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")!
    NSWorkspace.shared.open(automationURL)
}

