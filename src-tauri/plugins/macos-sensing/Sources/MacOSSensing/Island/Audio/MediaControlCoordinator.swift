import AppKit
import Foundation

enum MediaCommand {
    case toggle
    case next
    case previous
}

/// Routes media control requests through AppleScript when possible,
/// falling back to simulated media-key events.
final class MediaControlCoordinator {
    private let appleScriptController = AppleScriptMediaController()
    private let mediaKeyController = MediaKeyController()

    func togglePlayback(for bundleID: String?) {
        if appleScriptController.perform(.toggle, bundleID: bundleID) { return }
        mediaKeyController.playPause()
    }

    func skipToNext(for bundleID: String?) {
        if appleScriptController.perform(.next, bundleID: bundleID) { return }
        mediaKeyController.nextTrack()
    }

    func skipToPrevious(for bundleID: String?) {
        if appleScriptController.perform(.previous, bundleID: bundleID) { return }
        mediaKeyController.previousTrack()
    }

    func seek(to position: TimeInterval, bundleID: String?) {
        _ = appleScriptController.seek(to: position, bundleID: bundleID)
        // No media-key fallback for seeking; unsupported sources are ignored.
    }
}

// MARK: - AppleScript control

private final class AppleScriptMediaController {
    func perform(_ command: MediaCommand, bundleID: String?) -> Bool {
        guard let bundleID, let source = script(for: command, bundleID: bundleID) else {
            return false
        }
        return AppleScriptRunner.execute(source)
    }

    func seek(to position: TimeInterval, bundleID: String?) -> Bool {
        guard let bundleID, let source = seekScript(for: position, bundleID: bundleID) else {
            return false
        }
        return AppleScriptRunner.execute(source)
    }

    private func script(for command: MediaCommand, bundleID: String) -> String? {
        switch (bundleID, command) {
        case ("com.spotify.client", .toggle):
            return #"tell application "Spotify" to playpause"#
        case ("com.spotify.client", .next):
            return #"tell application "Spotify" to next track"#
        case ("com.spotify.client", .previous):
            return #"tell application "Spotify" to previous track"#
        case ("com.apple.Music", .toggle):
            return #"tell application "Music" to playpause"#
        case ("com.apple.Music", .next):
            return #"tell application "Music" to next track"#
        case ("com.apple.Music", .previous):
            return #"tell application "Music" to previous track"#
        default:
            return nil
        }
    }

    private func seekScript(for position: TimeInterval, bundleID: String) -> String? {
        let clamped = max(0, position)
        let formatted = String(format: "%.3f", clamped)
        switch bundleID {
        case "com.spotify.client":
            return """
            tell application "Spotify"
                set player position to \(formatted)
            end tell
            """
        case "com.apple.Music":
            return """
            tell application "Music"
                set player position to \(formatted)
            end tell
            """
        default:
            return nil
        }
    }
}

// MARK: - Media key fallback

private final class MediaKeyController {
    private enum MediaKey: Int32 {
        case playPause = 16   // NX_KEYTYPE_PLAY
        case next = 17        // NX_KEYTYPE_NEXT
        case previous = 18    // NX_KEYTYPE_PREVIOUS
    }

    func playPause() { send(.playPause) }
    func nextTrack() { send(.next) }
    func previousTrack() { send(.previous) }

    private func send(_ key: MediaKey) {
        let flags = NSEvent.ModifierFlags(rawValue: 0xA00) // NX_SHIFTMASK | NX_CONTROLMASK
        let dataDown = Int((key.rawValue << 16) | (0xA << 8))
        let dataUp = Int((key.rawValue << 16) | (0xB << 8))

        guard let downEvent = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: flags,
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: dataDown,
            data2: -1
        ), let upEvent = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: flags,
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: dataUp,
            data2: -1
        ) else {
            return
        }

        downEvent.cgEvent?.post(tap: .cghidEventTap)
        upEvent.cgEvent?.post(tap: .cghidEventTap)
    }
}

// MARK: - AppleScript helpers

enum AppleScriptRunner {
    /// Default timeout for AppleScript execution (seconds).
    /// 3s is generous for normal execution (~100ms) but prevents multi-second hangs
    /// when apps like Spotify are starting up or unresponsive.
    private static let defaultTimeout: TimeInterval = 3.0

    static func execute(_ source: String) -> Bool {
        return runWithTimeout(timeout: defaultTimeout) {
            guard let script = NSAppleScript(source: source) else {
                return false
            }
            var error: NSDictionary?
            script.executeAndReturnError(&error)
            return error == nil
        } ?? false
    }

    static func evaluateString(_ source: String) -> String? {
        return runWithTimeout(timeout: defaultTimeout) {
            guard let script = NSAppleScript(source: source) else {
                return nil as String?
            }
            var error: NSDictionary?
            let descriptor = script.executeAndReturnError(&error)
            guard error == nil else { return nil }
            return descriptor.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        } ?? nil
    }

    /// Run a closure on a background queue with a timeout.
    /// Returns nil if the timeout expires — the next poll cycle will retry.
    private static func runWithTimeout<T>(timeout: TimeInterval, body: @escaping () -> T) -> T? {
        let semaphore = DispatchSemaphore(value: 0)
        var result: T?
        DispatchQueue.global(qos: .userInitiated).async {
            result = body()
            semaphore.signal()
        }
        let waitResult = semaphore.wait(timeout: .now() + timeout)
        if waitResult == .timedOut {
            // NSLog("[MediaMonitor] AppleScript timed out after %.1fs", timeout)
            return nil
        }
        return result
    }
}
