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
}

// MARK: - AppleScript control

private final class AppleScriptMediaController {
    func perform(_ command: MediaCommand, bundleID: String?) -> Bool {
        guard let bundleID, let source = script(for: command, bundleID: bundleID) else {
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
    static func execute(_ source: String) -> Bool {
        guard let script = NSAppleScript(source: source) else {
            return false
        }
        var error: NSDictionary?
        script.executeAndReturnError(&error)
        return error == nil
    }

    static func evaluateString(_ source: String) -> String? {
        guard let script = NSAppleScript(source: source) else {
            return nil
        }
        var error: NSDictionary?
        let descriptor = script.executeAndReturnError(&error)
        guard error == nil else { return nil }
        return descriptor.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
