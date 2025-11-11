import Foundation

/// Owns timer state, uptime calculations, and the 1-second render loop.
final class IslandTimerPresenter {
    struct DisplayUpdate {
        let displayMs: Int64
        let mode: IslandMode?
        let idle: Bool?
    }

    var onDisplayUpdate: ((DisplayUpdate) -> Void)?

    private var startUptimeMs: Int64 = 0
    private var targetMs: Int64?
    private var mode: IslandMode = .countdown
    private var isIdle: Bool = true
    private var renderTimer: Timer?

    func initializeIdleState() {
        isIdle = true
        onDisplayUpdate?(DisplayUpdate(displayMs: 0, mode: .countdown, idle: true))
    }

    func start(with payload: IslandStartPayload) {
        isIdle = false
        mode = payload.mode
        startUptimeMs = payload.startUptimeMs
        targetMs = (payload.mode == .countdown || payload.mode == .break) ? payload.targetMs : nil

        let initialDisplayMs: Int64 = {
            switch payload.mode {
            case .countdown, .break:
                return max(0, payload.targetMs)
            case .stopwatch:
                return 0
            }
        }()

        onDisplayUpdate?(
            DisplayUpdate(displayMs: initialDisplayMs, mode: payload.mode, idle: false)
        )

        startRenderLoop()
    }

    func sync(authoritativeMs: Int64) {
        onDisplayUpdate?(DisplayUpdate(displayMs: authoritativeMs, mode: nil, idle: nil))
        reseedClock(authoritativeMs: authoritativeMs)
    }

    func reset() {
        renderTimer?.invalidate()
        renderTimer = nil
        isIdle = true
        onDisplayUpdate?(DisplayUpdate(displayMs: 0, mode: .countdown, idle: true))
    }

    func cleanup() {
        renderTimer?.invalidate()
        renderTimer = nil
    }

    // MARK: - Private

    private func startRenderLoop() {
        renderTimer?.invalidate()
        renderTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            let displayMs = self.currentDisplayMs()
            self.onDisplayUpdate?(DisplayUpdate(displayMs: displayMs, mode: nil, idle: nil))
        }

        if let timer = renderTimer {
            RunLoop.main.add(timer, forMode: .common)
            timer.fire()
        }
    }

    private func reseedClock(authoritativeMs: Int64) {
        let now = currentUptimeMs()
        switch mode {
        case .countdown, .break:
            guard let target = targetMs else { return }
            let elapsed = max(Int64(0), target - authoritativeMs)
            startUptimeMs = now - elapsed
        case .stopwatch:
            let elapsed = max(Int64(0), authoritativeMs)
            startUptimeMs = now - elapsed
        }
    }

    private func currentDisplayMs() -> Int64 {
        let now = currentUptimeMs()
        let elapsed = max(Int64(0), now - startUptimeMs)
        switch mode {
        case .countdown, .break:
            guard let target = targetMs else { return 0 }
            return max(Int64(0), target - elapsed)
        case .stopwatch:
            return elapsed
        }
    }

    private func currentUptimeMs() -> Int64 {
        Int64(ProcessInfo.processInfo.systemUptime * 1000.0)
    }
}
