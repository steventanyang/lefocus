import Foundation

public enum IslandMode: String {
    case countdown
    case stopwatch
}

public struct IslandStartPayload {
    public let startUptimeMs: Int64
    /// Countdown duration in milliseconds. Pass 0 when launching in stopwatch mode.
    public let targetMs: Int64
    public let mode: IslandMode
}
