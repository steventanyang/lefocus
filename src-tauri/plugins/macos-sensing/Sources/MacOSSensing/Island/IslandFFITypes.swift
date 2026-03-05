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

// MARK: - Agent Session Types

public enum AgentSessionState: UInt8 {
    case thinking = 0
    case executing = 1
    case waiting = 2
    case done = 3
}

public struct AgentSessionInfo {
    public let pid: UInt32
    public let state: AgentSessionState
    public let ageSeconds: Float
}
