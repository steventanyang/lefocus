import Cocoa
import Foundation
import QuartzCore

// Declare C FFI functions for timer callbacks
@_silgen_name("macos_sensing_trigger_end_timer")
func macos_sensing_trigger_end_timer()

@_silgen_name("macos_sensing_trigger_cancel_timer")
func macos_sensing_trigger_cancel_timer()

@_silgen_name("macos_sensing_trigger_focus_app")
func macos_sensing_trigger_focus_app()

/// Coordinates the Dynamic Island window, timer presenter, and audio controller.
public final class IslandController {
    public static let shared = IslandController()

    private let windowManager: IslandWindowManager
    private let timerPresenter = IslandTimerPresenter()
    private let audioController = IslandAudioController()
    private let stateQueue = DispatchQueue(label: "MacOSSensing.IslandController")

    private var latestTimerUpdate: IslandTimerPresenter.DisplayUpdate?
    private var timerIsIdle: Bool = true
    private var activeMode: IslandMode = .countdown
    private var previousDisplayMs: Int64?
    private var currentTrack: TrackInfo?
    private var waveformBars: [CGFloat] = []
    private var waveformGradient: NSGradient?
    private var hasPlayedCompletionChime: Bool = false

    private var isExpanded: Bool = false
    private var isHovering: Bool = false
    private var collapseWorkItem: DispatchWorkItem?

    private var islandView: IslandView? {
        windowManager.islandView
    }

    private init() {
        let configuration = IslandWindowConfiguration(
            compactSize: NSSize(width: 320.0, height: 38.0),
            expandedSize: NSSize(width: 420.0, height: 170.0),
            hoverDelta: NSSize(width: 22.0, height: 5.0),
            expandedVerticalOffset: 14.0,
            compactIdleWidth: 280.0,
            compactTimerWidth: 340.0,
            expandedIdleWidth: 300.0,
            expandedTimerWidth: 380.0,
            expandedIdleHeight: 170.0,    // With progress bar
            expandedTimerHeight: 150.0    // Without progress bar (timer active)
        )
        windowManager = IslandWindowManager(configuration: configuration)
        windowManager.delegate = self
        windowManager.interactionDelegate = self

        timerPresenter.onDisplayUpdate = { [weak self] update in
            guard let self else { return }
            self.latestTimerUpdate = update
            if let mode = update.mode {
                self.activeMode = mode
            }

            let priorDisplayMs = self.previousDisplayMs
            self.previousDisplayMs = update.displayMs

            if let idle = update.idle {
                self.timerIsIdle = idle
                self.windowManager.updateTimerState(isIdle: idle, animated: true)
            } else {
                self.windowManager.updateTimerState(isIdle: self.timerIsIdle, animated: true)
            }

            self.handleCompletionChimeIfNeeded(update: update, previousDisplayMs: priorDisplayMs)
            self.islandView?.update(displayMs: update.displayMs, mode: update.mode, idle: update.idle)
            // Update window size based on timer state (narrower when idle)
        }

        audioController.delegate = self
    }

    // MARK: - Public API

    public func initialize() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                self.windowManager.ensureWindowHierarchy()
                self.audioController.startMonitoring()
                self.timerPresenter.initializeIdleState()
                IslandChimePlayer.shared.bootstrap()
            }
        }
    }

    public func start(payload: IslandStartPayload) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                self.windowManager.ensureWindowHierarchy()
                self.audioController.startMonitoring()
                self.timerPresenter.start(with: payload)
                self.activeMode = payload.mode
                self.previousDisplayMs = nil
                IslandChimePlayer.shared.bootstrap()
            }
        }
    }

    public func sync(authoritativeMs: Int64) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                self.timerPresenter.sync(authoritativeMs: authoritativeMs)
            }
        }
    }

    public func reset() {
        stateQueue.async { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                self.timerPresenter.reset()
                self.previousDisplayMs = nil
            }
        }
    }

    public func setVisible(_ visible: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.windowManager.setVisible(visible)
        }
    }

    public func cleanup() {
        stateQueue.sync { [weak self] in
            let cleanupWork = { [weak self] in
                guard let self else { return }
                self.audioController.stopMonitoring()
                self.timerPresenter.cleanup()
                self.windowManager.teardown()
                IslandSpaceManager.shared.teardown()
                self.collapseWorkItem?.cancel()
                self.collapseWorkItem = nil
            }

            if Thread.isMainThread {
                cleanupWork()
            } else {
                DispatchQueue.main.async(execute: cleanupWork)
            }
        }
    }

    public func endTimer() {
        // Trigger Rust callback via C shim
        macos_sensing_trigger_end_timer()
    }

    public func cancelTimer() {
        // Trigger Rust callback via C shim
        macos_sensing_trigger_cancel_timer()
    }

    private func collapseAndFocusApp() {
        setExpanded(false)
        macos_sensing_trigger_focus_app()
    }

    // MARK: - Private Helpers

    private func configureIslandView(_ view: IslandView) {
        view.interactionDelegate = self
        let isIdle: Bool
        if let update = latestTimerUpdate {
            view.update(displayMs: update.displayMs, mode: update.mode, idle: update.idle)
            // When idle is nil, assume timer is active (not idle)
            isIdle = update.idle ?? false
        } else {
            view.update(displayMs: 0, mode: .countdown, idle: true)
            isIdle = true
        }
        // Set initial timer state for window sizing
        windowManager.updateTimerState(isIdle: isIdle, animated: false)
        updateAudioUI(for: view)
        view.updateInteractionState(isExpanded: isExpanded, isHovered: isHovering)
    }

    private func updateViewInteractionState(animated: Bool = true) {
        windowManager.updateInteractionState(isExpanded: isExpanded, isHovering: isHovering, animated: animated)
        islandView?.updateInteractionState(isExpanded: isExpanded, isHovered: isHovering)
    }

    private func setExpanded(_ expanded: Bool, animated: Bool = true) {
        guard isExpanded != expanded else { return }
        if expanded && currentTrack == nil && timerIsIdle {
            return
        }

        isExpanded = expanded
        if expanded {
            cancelCollapseWorkItem()
        }
        updateViewInteractionState(animated: animated)
    }

    private func scheduleCollapse(after delay: TimeInterval) {
        guard isExpanded else { return }
        collapseWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            self?.setExpanded(false)
        }
        collapseWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private func cancelCollapseWorkItem() {
        collapseWorkItem?.cancel()
        collapseWorkItem = nil
    }

    private func updateAudioUI(for view: IslandView? = nil, waveformBars: [CGFloat]? = nil) {
        let targetView = view ?? islandView
        let shouldAnimate = (view == nil)
        windowManager.updateAudioPresence(hasAudio: currentTrack != nil, animated: shouldAnimate)
        if let currentTrack {
            targetView?.updateAudio(
                track: currentTrack,
                waveformBars: waveformBars ?? self.waveformBars,
                waveformGradient: waveformGradient
            )
        } else {
            targetView?.updateAudio(track: nil, waveformBars: nil, waveformGradient: nil)
        }
    }

    private func handleCompletionChimeIfNeeded(update: IslandTimerPresenter.DisplayUpdate, previousDisplayMs: Int64?) {
        let pendingIdle = update.idle ?? timerIsIdle
        let modeAllowsChime = (activeMode == .countdown || activeMode == .break)
        let crossedZero: Bool = {
            guard let previous = previousDisplayMs else { return false }
            return previous > 0 && update.displayMs <= 0
        }()
        let isFinished = modeAllowsChime && crossedZero && !pendingIdle

        if isFinished {
            if !hasPlayedCompletionChime {
                hasPlayedCompletionChime = true
                IslandChimePlayer.shared.playCompletionIfNeeded()
            }
        } else {
            hasPlayedCompletionChime = false
        }
    }
}

// MARK: - IslandWindowManagerDelegate

extension IslandController: IslandWindowManagerDelegate {
    func islandWindowManagerDidCreateView(_ manager: IslandWindowManager, view: IslandView) {
        configureIslandView(view)
    }
}

// MARK: - IslandViewInteractionDelegate

extension IslandController: IslandViewInteractionDelegate {
    func islandViewDidRequestToggleExpansion(_ view: IslandView) {
        setExpanded(!isExpanded)
    }

    func islandView(_ view: IslandView, hoverChanged isHovered: Bool) {
        isHovering = isHovered
        updateViewInteractionState()
        if isHovered {
            cancelCollapseWorkItem()
        }
    }

    func islandViewDidRequestCollapse(_ view: IslandView, delay: TimeInterval) {
        scheduleCollapse(after: delay)
    }

    func islandViewDidCancelCollapseRequest(_ view: IslandView) {
        cancelCollapseWorkItem()
    }

    func islandViewDidRequestPlayPause(_ view: IslandView) {
        audioController.togglePlayback()
    }

    func islandViewDidRequestNext(_ view: IslandView) {
        audioController.skipToNext()
    }

    func islandViewDidRequestPrevious(_ view: IslandView) {
        audioController.skipToPrevious()
    }

    func islandViewDidRequestEndTimer(_ view: IslandView) {
        endTimer()
        collapseAndFocusApp()
    }

    func islandViewDidRequestCancelTimer(_ view: IslandView) {
        cancelTimer()
        collapseAndFocusApp()
    }

    func islandView(_ view: IslandView, didRequestSeek position: TimeInterval) {
        audioController.seek(to: position)
    }
}

// MARK: - IslandAudioControllerDelegate

extension IslandController: IslandAudioControllerDelegate {
    func islandAudioController(
        _ controller: IslandAudioController,
        didUpdateTrack track: TrackInfo?,
        gradient: NSGradient?
    ) {
        currentTrack = track
        waveformGradient = gradient
        if track == nil {
            waveformBars = []
            setExpanded(false)
        }
        updateAudioUI()
    }

    func islandAudioController(_ controller: IslandAudioController, didUpdateWaveform bars: [CGFloat]) {
        guard currentTrack != nil else { return }
        waveformBars = bars
        updateAudioUI(waveformBars: bars)
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
