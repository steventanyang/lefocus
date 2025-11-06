import Cocoa
import Foundation

/// Controls the floating island window that mirrors the timer state.
public final class IslandController {
    public static let shared = IslandController()

    private var window: NSPanel?
    private var islandWindow: NSPanel?
    private var islandView: IslandView?
    private let stateQueue = DispatchQueue(label: "MacOSSensing.IslandController")
    private var renderTimer: Timer?
    private var screenObserver: NSObjectProtocol?

    private var startUptimeMs: Int64 = 0
    private var targetMs: Int64?
    private var mode: IslandMode = .countdown
    private var isIdle: Bool = true

    private init() {}

    // MARK: - Public API

    /// Initialize the island window on app startup - shows "00:00" in idle state.
    public func initialize() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                self.ensureWindowHierarchy()
                self.isIdle = true
                self.islandView?.update(displayMs: 0, mode: .countdown, idle: true)
                self.islandWindow?.orderFrontRegardless()
            }
        }
    }

    /// Start (or restart) the island with the supplied payload.
    public func start(payload: IslandStartPayload) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                self.isIdle = false
                self.ensureWindowHierarchy()
                self.applyStartPayload(payload)
                self.startRenderLoop()
            }
        }
    }

    /// Apply an authoritative timer measurement to correct drift.
    public func sync(authoritativeMs: Int64) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                self.applyAuthoritativeValue(authoritativeMs)
            }
        }
    }

    /// Reset the island to idle state (00:00) without hiding it.
    public func reset() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                self.renderTimer?.invalidate()
                self.renderTimer = nil
                self.isIdle = true
                self.islandView?.update(displayMs: 0, mode: .countdown, idle: true)
            }
        }
    }

    /// Tear down resources (invoke during app shutdown).
    public func cleanup() {
        stateQueue.sync { [weak self] in
            let cleanupWork = { [weak self] in
                guard let self else { return }
                if let observer = self.screenObserver {
                    NotificationCenter.default.removeObserver(observer)
                    self.screenObserver = nil
                }
                self.renderTimer?.invalidate()
                self.renderTimer = nil
                self.window?.close()
                self.window = nil
                self.islandWindow?.close()
                self.islandWindow = nil
                self.islandView = nil
            }

            if Thread.isMainThread {
                cleanupWork()
            } else {
                DispatchQueue.main.async(execute: cleanupWork)
            }
        }
    }

    // MARK: - Private Helpers

    private func ensureWindowHierarchy() {
        guard let screen = NSScreen.lf_preferredIslandDisplay ?? NSScreen.main else {
            NSLog("IslandController: no available screen for island")
            return
        }

        if screenObserver == nil {
            screenObserver = NotificationCenter.default.addObserver(
                forName: NSApplication.didChangeScreenParametersNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.repositionForCurrentScreen()
            }
        }

        if window == nil {
            let panel = NSPanel(
                contentRect: screen.frame,
                styleMask: [.borderless, .nonactivatingPanel, .utilityWindow, .hudWindow],
                backing: .buffered,
                defer: false
            )
            panel.level = .mainMenu + 1
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = false
            panel.hidesOnDeactivate = false
            panel.ignoresMouseEvents = true
            panel.isMovable = false
            panel.isMovableByWindowBackground = false
            panel.isReleasedWhenClosed = false
            panel.collectionBehavior = [
                .canJoinAllSpaces,
                .stationary,
                .fullScreenAuxiliary,
                .ignoresCycle
            ]
            panel.contentView = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
            self.window = panel
        }

        if islandWindow == nil {
            let targetFrame = islandFrame(for: screen)
            let islandPanel = NSPanel(
                contentRect: targetFrame,
                styleMask: [.borderless, .nonactivatingPanel],
                backing: .buffered,
                defer: false
            )
            islandPanel.level = .mainMenu + 2
            islandPanel.isOpaque = false
            islandPanel.backgroundColor = .clear
            islandPanel.hasShadow = true
            islandPanel.hidesOnDeactivate = false
            islandPanel.ignoresMouseEvents = false
            islandPanel.isMovable = false
            islandPanel.isMovableByWindowBackground = false
            islandPanel.isReleasedWhenClosed = false
            islandPanel.collectionBehavior = [
                .canJoinAllSpaces,
                .stationary,
                .fullScreenAuxiliary,
                .ignoresCycle
            ]

            let view = IslandView(frame: NSRect(origin: .zero, size: targetFrame.size))
            islandPanel.contentView = view
            islandPanel.orderFrontRegardless()

            window?.addChildWindow(islandPanel, ordered: .above)

            islandWindow = islandPanel
            islandView = view
        }

        window?.setFrame(screen.frame, display: true)
        window?.orderFrontRegardless()

        if let islandPanel = islandWindow {
            islandPanel.setFrame(islandFrame(for: screen), display: true)
            islandPanel.orderFrontRegardless()
        }
    }

    private func repositionForCurrentScreen() {
        guard let panel = window else { return }
        guard let screen = panel.screen ?? NSScreen.lf_preferredIslandDisplay ?? NSScreen.main else {
            return
        }
        panel.setFrame(screen.frame, display: true)
        if let islandPanel = islandWindow {
            islandPanel.setFrame(islandFrame(for: screen), display: true)
        }
        panel.orderFrontRegardless()
        islandWindow?.orderFrontRegardless()
    }

    private func applyStartPayload(_ payload: IslandStartPayload) {
        startUptimeMs = payload.startUptimeMs
        mode = payload.mode
        targetMs = payload.mode == .countdown ? payload.targetMs : nil

        let initialDisplayMs: Int64 = {
            switch payload.mode {
            case .countdown:
                return max(0, payload.targetMs)
            case .stopwatch:
                return 0
            }
        }()

        islandView?.update(displayMs: initialDisplayMs, mode: payload.mode, idle: false)
        islandWindow?.orderFrontRegardless()
    }

    private func startRenderLoop() {
        renderTimer?.invalidate()
        renderTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            let displayMs = self.currentDisplayMs()
            self.islandView?.update(displayMs: displayMs, mode: nil)
        }

        if let timer = renderTimer {
            RunLoop.main.add(timer, forMode: .common)
            timer.fire()
        }
    }

    private func applyAuthoritativeValue(_ authoritativeMs: Int64) {
        islandView?.update(displayMs: authoritativeMs, mode: nil)
        reseedClock(authoritativeMs: authoritativeMs)
    }

    private func reseedClock(authoritativeMs: Int64) {
        let now = currentUptimeMs()
        switch mode {
        case .countdown:
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
        case .countdown:
            guard let target = targetMs else { return 0 }
            return max(Int64(0), target - elapsed)
        case .stopwatch:
            return elapsed
        }
    }

    private static let compactSize = NSSize(width: 300.0, height: 36.0)

    private func currentUptimeMs() -> Int64 {
        Int64(ProcessInfo.processInfo.systemUptime * 1000.0)
    }

    private func islandFrame(for screen: NSScreen) -> NSRect {
        let size = Self.compactSize
        // Center horizontally on screen
        let originX = screen.frame.midX - size.width / 2.0
        
        if let notch = screen.lf_notchRect {
            // Align with top of notch, accounting for vertical inset
            let originY = notch.maxY - size.height + islandVerticalInset(for: screen)
            return NSRect(x: originX, y: originY, width: size.width, height: size.height)
        }

        // No notch: center horizontally, position near top
        let originY = screen.frame.maxY - size.height - 8.0
        return NSRect(x: originX, y: originY, width: size.width, height: size.height)
    }

    private func islandVerticalInset(for screen: NSScreen) -> CGFloat {
        if #available(macOS 13.0, *), screen.safeAreaInsets.top > 0 {
            return 2.0  // Move up to align with notch top
        }
        return 0.0
    }
}

// MARK: - NSScreen helpers

    extension NSScreen {
        static var lf_preferredIslandDisplay: NSScreen? {
            if let builtIn = NSScreen.screens.first(where: { $0.lf_isBuiltIn }) {
                return builtIn
            }
            return NSScreen.main
        }

        var lf_isBuiltIn: Bool {
            CGDisplayIsBuiltin(lf_displayID) != 0
        }

        var lf_hasNotch: Bool {
            guard #available(macOS 12.0, *) else {
                return false
            }
            let extraInset = safeAreaInsets.top - lf_menuBarHeight
            return extraInset > 1.0
        }

        var lf_notchRect: NSRect? {
            guard #available(macOS 12.0, *) else {
                return nil
            }
            guard safeAreaInsets.top > 0 else {
                return nil
            }

            let leftWidth: CGFloat
            let rightWidth: CGFloat
            if #available(macOS 13.0, *) {
                leftWidth = auxiliaryTopLeftArea?.width ?? 0
                rightWidth = auxiliaryTopRightArea?.width ?? 0
            } else {
                let totalPad = frame.width - visibleFrame.width
                leftWidth = totalPad / 2.0
                rightWidth = totalPad / 2.0
            }
            let notchWidth = max(0, frame.width - leftWidth - rightWidth)
            let notchHeight = safeAreaInsets.top
            let originX = frame.minX + leftWidth
            let originY = frame.maxY - notchHeight
            return NSRect(x: originX, y: originY, width: notchWidth, height: notchHeight)
        }

        var lf_safeNotchBottom: CGFloat {
            guard #available(macOS 12.0, *) else {
                return visibleFrame.maxY
            }
            return frame.maxY - safeAreaInsets.top
        }

    var lf_menuBarHeight: CGFloat {
        frame.maxY - visibleFrame.maxY
    }

    private var lf_displayID: CGDirectDisplayID {
        if let number = deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber {
            return CGDirectDisplayID(number.uint32Value)
        }
        return 0
    }
}
