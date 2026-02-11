import Foundation

public enum IslandMode: String {
    case countdown
    case stopwatch
    case `break`
}

public struct IslandStartPayload {
    public let startUptimeMs: Int64
    /// Countdown duration in milliseconds. Pass 0 when launching in stopwatch mode.
    public let targetMs: Int64
    public let mode: IslandMode
}

// MARK: - Claude Session Types

public enum ClaudeSessionState: UInt8 {
    case thinking = 0
    case executing = 1
    case waiting = 2
    case done = 3
}

public struct ClaudeSessionInfo {
    public let pid: UInt32
    public let state: ClaudeSessionState
    public let ageSeconds: Float
}
