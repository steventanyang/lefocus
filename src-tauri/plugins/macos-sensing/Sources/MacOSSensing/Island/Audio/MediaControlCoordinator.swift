import AppKit
import Darwin
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
    private let controlQueue = DispatchQueue(
        label: "MacOSSensing.MediaControlCoordinator",
        qos: .userInitiated
    )

    func togglePlayback(for bundleID: String?) {
        controlQueue.async { [appleScriptController, mediaKeyController] in
            if appleScriptController.perform(.toggle, bundleID: bundleID) { return }
            mediaKeyController.playPause()
        }
    }

    func skipToNext(for bundleID: String?) {
        controlQueue.async { [appleScriptController, mediaKeyController] in
            if appleScriptController.perform(.next, bundleID: bundleID) { return }
            mediaKeyController.nextTrack()
        }
    }

    func skipToPrevious(for bundleID: String?) {
        controlQueue.async { [appleScriptController, mediaKeyController] in
            if appleScriptController.perform(.previous, bundleID: bundleID) { return }
            mediaKeyController.previousTrack()
        }
    }

    func seek(to position: TimeInterval, bundleID: String?) {
        controlQueue.async { [appleScriptController] in
            _ = appleScriptController.seek(to: position, bundleID: bundleID)
            // No media-key fallback for seeking; unsupported sources are ignored.
        }
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
    /// when a media app is starting up or unresponsive.
    private static let defaultTimeout: TimeInterval = 3.0
    private static let executionQueue = DispatchQueue(
        label: "MacOSSensing.AppleScriptRunner",
        qos: .userInitiated
    )

    static func execute(_ source: String) -> Bool {
        executionQueue.sync {
            run(source, captureOutput: false, timeout: defaultTimeout) != nil
        }
    }

    static func evaluateString(_ source: String) -> String? {
        executionQueue.sync {
            run(source, captureOutput: true, timeout: defaultTimeout)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    /// Execute AppleScript out of process so a compiler/runtime fault cannot crash Pomodoro.
    /// The serial queue also guarantees a timed-out poll cannot overlap the next invocation.
    private static func run(
        _ source: String,
        captureOutput: Bool,
        timeout: TimeInterval
    ) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", source]
        process.standardError = FileHandle.nullDevice

        let outputPipe = captureOutput ? Pipe() : nil
        process.standardOutput = outputPipe ?? FileHandle.nullDevice

        let terminated = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in terminated.signal() }

        do {
            try process.run()
        } catch {
            NSLog("[AppleScriptRunner] Failed to launch osascript: %@", error.localizedDescription)
            return nil
        }

        if terminated.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            if terminated.wait(timeout: .now() + 0.5) == .timedOut {
                Darwin.kill(process.processIdentifier, SIGKILL)
                _ = terminated.wait(timeout: .now() + 0.5)
            }
            NSLog("[AppleScriptRunner] osascript timed out after %.1fs", timeout)
            return nil
        }

        guard process.terminationStatus == 0 else { return nil }
        guard let outputPipe else { return "" }
        let data = outputPipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)
    }
}
