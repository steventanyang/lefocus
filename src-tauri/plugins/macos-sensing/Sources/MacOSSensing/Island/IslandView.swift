import Cocoa

protocol IslandViewInteractionDelegate: AnyObject {
    func islandViewDidRequestToggleExpansion(_ view: IslandView)
    func islandView(_ view: IslandView, hoverChanged isHovered: Bool)
    func islandViewDidRequestCollapse(_ view: IslandView, delay: TimeInterval)
    func islandViewDidCancelCollapseRequest(_ view: IslandView)
    func islandViewDidRequestPlayPause(_ view: IslandView)
    func islandViewDidRequestNext(_ view: IslandView)
    func islandViewDidRequestPrevious(_ view: IslandView)
    func islandViewDidRequestEndTimer(_ view: IslandView)
    func islandViewDidRequestCancelTimer(_ view: IslandView)
    func islandView(_ view: IslandView, didRequestSeek position: TimeInterval)
}

final class IslandView: NSView {
    weak var interactionDelegate: IslandViewInteractionDelegate?

    var displayMs: Int64 = 0
    var mode: IslandMode = .countdown
    var isIdle: Bool = true
    var trackInfo: TrackInfo?
    var isAudioPlaying: Bool = false
    var waveformBars: [CGFloat] = []
    var hasTimerFinished: Bool = false
    var completionHighlightColor: NSColor {
        // FaceTime Dynamic Island green: #34DA4F (RGB: 52, 218, 79)
        NSColor(calibratedRed: 52.0/255.0, green: 218.0/255.0, blue: 79.0/255.0, alpha: 1.0)
    }
    
    // Animated color that transitions from black to green
    var animatedCompletionColor: NSColor {
        if completionColorTransition <= 0.0 {
            return NSColor.black
        } else if completionColorTransition >= 1.0 {
            return completionHighlightColor
        } else {
            // Interpolate between black and green
            let red = 0.0 + (52.0/255.0 - 0.0) * completionColorTransition
            let greenComponent = 0.0 + (218.0/255.0 - 0.0) * completionColorTransition
            let blue = 0.0 + (79.0/255.0 - 0.0) * completionColorTransition
            return NSColor(calibratedRed: red, green: greenComponent, blue: blue, alpha: 1.0)
        }
    }
    var claudeSessions: [ClaudeSessionInfo] = []

    /// Extra height at the bottom of the view reserved for Claude session dots.
    /// Now zero — dots are drawn inside the island itself.
    static let dotsBottomPadding: CGFloat = 0.0

    /// Vertical center of the notch content area.
    var notchCenterY: CGFloat {
        bounds.height / 2.0
    }

    /// Width of the dots zone in compact mode (left of waveform/timer).
    var compactDotsZoneWidth: CGFloat {
        Self.compactDotsZoneWidth(for: claudeSessions.count)
    }

    static func compactDotsZoneWidth(for count: Int) -> CGFloat {
        let capped = min(count, 8)
        guard capped > 0 else { return 0 }
        let dotSize: CGFloat = capped <= 4 ? 8.0 : 6.0
        let columns = capped <= 2 ? 1 : Int(ceil(Double(capped) / 2.0))
        let dotsContent = CGFloat(columns) * dotSize + CGFloat(max(0, columns - 1)) * 3.0
        return 22.0 + dotsContent + 4.0
    }

    var trackingArea: NSTrackingArea?
    var isExpanded: Bool = false
    var isHovered: Bool = false

    struct ButtonArea {
        var rect: NSRect = .zero
        var isHovered: Bool = false
    }

    var playPauseButton = ButtonArea()
    var previousButton = ButtonArea()
    var nextButton = ButtonArea()

    var timerEndButton = ButtonArea()
    var timerCancelButton = ButtonArea()
    struct ProgressBarArea {
        var barRect: NSRect = .zero
        var isHovered: Bool = false
        var isInteractable: Bool = false
        var isDragging: Bool = false
        var pendingSeekPosition: TimeInterval?
        var pendingSeekTimestamp: Date?
        // Animation state for Apple-style progress bar
        var animatedHeight: CGFloat = 6.0
        var animatedOpacity: CGFloat = 0.5
    }
    var progressBarArea = ProgressBarArea()

    // Debouncing for timer control buttons
    var lastTimerButtonClickTime: TimeInterval?
    let timerButtonDebounceInterval: TimeInterval = 0.5  // 500ms

    // Fade animation for expansion
    var expandedContentOpacity: CGFloat = 0.0
    var fadeAnimationTimer: Timer?
    
    // Progress bar animation
    var progressBarAnimationTimer: Timer?
    
    // Completion color transition animation
    var completionColorTransition: CGFloat = 0.0  // 0.0 = black, 1.0 = green
    var completionColorAnimationTimer: Timer?

    // Thinking pulse animation timer (15 Hz, active only when thinking sessions exist)
    private var thinkingAnimationTimer: Timer?
    private(set) var waveformGradient: NSGradient?

    // Dot removal animation state
    private var previousSessionPIDs: Set<UInt32> = []
    struct FadingDot {
        let session: ClaudeSessionInfo
        let oldIndex: Int       // position in the old layout
        let oldCount: Int       // total count of old layout
        let startTime: CFTimeInterval
    }
    var fadingDots: [FadingDot] = []
    private var removalAnimationTimer: Timer?
    static let removalDuration: TimeInterval = 0.3
    var onRemovalAnimationComplete: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        initializeTracking()
        wantsLayer = true
        autoresizingMask = [.width, .height]
    }

    required init?(coder: NSCoder) {
        nil
    }

    // MARK: - Public API

    func update(displayMs: Int64, mode: IslandMode?, idle: Bool? = nil) {
        let wasFinished = self.hasTimerFinished
        self.hasTimerFinished = displayMs <= 0 && !(idle ?? self.isIdle)
        self.displayMs = displayMs
        if let mode {
            self.mode = mode
        }
        if let idle {
            self.isIdle = idle
        }
        
        // Start color transition animation when timer finishes
        if !wasFinished && self.hasTimerFinished {
            startCompletionColorAnimation()
        } else if !self.hasTimerFinished {
            // Reset transition when timer is no longer finished
            stopCompletionColorAnimation()
            completionColorTransition = 0.0
        }
        
        needsDisplay = true
    }

    func updateInteractionState(isExpanded: Bool, isHovered: Bool) {
        let wasExpanded = self.isExpanded
        self.isExpanded = isExpanded
        self.isHovered = isHovered

        if isExpanded && !wasExpanded {
            // Starting expansion - begin fade-in animation
            startFadeInAnimation()
        } else if !isExpanded {
            // Collapsing - reset opacity immediately
            stopFadeAnimation()
            stopProgressBarAnimation()
            expandedContentOpacity = 0.0
            resetButtonAreas()
            progressBarArea = ProgressBarArea()
        }

        needsDisplay = true
    }

    func updateClaudeSessions(_ sessions: [ClaudeSessionInfo]) {
        let newPIDs = Set(sessions.map { $0.pid })
        let oldSessions = self.claudeSessions
        let removedPIDs = previousSessionPIDs.subtracting(newPIDs)

        // If an animation is already running, complete it instantly
        if !fadingDots.isEmpty {
            completeRemovalAnimation()
        }

        // Create fading dots for removed sessions
        if !removedPIDs.isEmpty {
            let now = CACurrentMediaTime()
            for (oldIndex, oldSession) in oldSessions.enumerated() {
                if removedPIDs.contains(oldSession.pid) {
                    fadingDots.append(FadingDot(
                        session: oldSession,
                        oldIndex: oldIndex,
                        oldCount: oldSessions.count,
                        startTime: now
                    ))
                }
            }
        }

        self.claudeSessions = sessions
        self.previousSessionPIDs = newPIDs

        // Start removal animation timer if we have fading dots
        if !fadingDots.isEmpty && removalAnimationTimer == nil {
            removalAnimationTimer = Timer.scheduledTimer(withTimeInterval: 1.0/60.0, repeats: true) { [weak self] _ in
                guard let self else { return }
                let now = CACurrentMediaTime()
                let allDone = self.fadingDots.allSatisfy { now - $0.startTime >= Self.removalDuration }
                if allDone {
                    self.completeRemovalAnimation()
                }
                self.needsDisplay = true
            }
        }

        // Start/stop pulse timer based on whether any session is thinking
        let hasThinking = sessions.contains { $0.state == .thinking }
        if hasThinking && thinkingAnimationTimer == nil {
            thinkingAnimationTimer = Timer.scheduledTimer(withTimeInterval: 1.0/15.0, repeats: true) { [weak self] _ in
                self?.needsDisplay = true
            }
        } else if !hasThinking && thinkingAnimationTimer != nil {
            thinkingAnimationTimer?.invalidate()
            thinkingAnimationTimer = nil
        }

        needsDisplay = true
    }

    private func completeRemovalAnimation() {
        fadingDots.removeAll()
        removalAnimationTimer?.invalidate()
        removalAnimationTimer = nil
        onRemovalAnimationComplete?()
        onRemovalAnimationComplete = nil
    }

    func updateAudio(track: TrackInfo?, waveformBars: [CGFloat]?, waveformGradient: NSGradient?) {
        self.waveformGradient = waveformGradient
        let finalTrack = applyPendingSeekIfNeeded(to: track)

        self.trackInfo = finalTrack
        self.isAudioPlaying = finalTrack?.isPlaying ?? false
        if let bars = waveformBars, finalTrack != nil {
            self.waveformBars = bars
        } else if finalTrack == nil {
            self.waveformBars = []
        }

        needsDisplay = true
    }

    // MARK: - View lifecycle

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        guard let context = NSGraphicsContext.current?.cgContext else { return }

        // Draw notch-clipped content
        context.saveGState()

        // Notch-shaped path: bottom corners curve inward, top corners curve outward
        let path = createNotchPath()

        // Clip to the notch path before drawing gradient
        path.addClip()

        if hasTimerFinished {
            let blur: CGFloat = isExpanded ? 18.0 : 14.0
            let glowAlpha: CGFloat = isExpanded ? 0.85 : 0.75
            context.setShadow(offset: .zero, blur: blur, color: animatedCompletionColor.withAlphaComponent(glowAlpha).cgColor)
        }

        if isExpanded {
            // Gradient background: opaque at top, translucent at bottom
            // Start gradient at 50% height, transition from opaque to current translucent value
            let colorSpace = CGColorSpaceCreateDeviceRGB()
            let topColor = NSColor.black.cgColor // Opaque black at top
            let midColor = NSColor.black.cgColor // Still opaque at 50%
            let bottomColor = NSColor.black.withAlphaComponent(0.85).cgColor // Translucent at bottom

            let colors = [topColor, midColor, bottomColor] as CFArray
            let locations: [CGFloat] = [0.0, 0.5, 1.0] // Top, 50%, bottom

            guard let gradient = CGGradient(colorsSpace: colorSpace, colors: colors, locations: locations) else {
                context.restoreGState()
                return
            }

            // Draw gradient from top to bottom
            let startPoint = CGPoint(x: bounds.midX, y: bounds.maxY)
            let endPoint = CGPoint(x: bounds.midX, y: bounds.minY)
            context.drawLinearGradient(gradient, start: startPoint, end: endPoint, options: [])
        } else {
            // Compact mode: solid opaque black
            NSColor.black.setFill()
            path.fill()
        }

        if hasTimerFinished {
            context.setShadow(offset: .zero, blur: 0.0, color: nil)
        }

        // Reset clip and draw border
        context.resetClip()
        path.addClip()

        let borderColor = hasTimerFinished ? animatedCompletionColor : NSColor.black
        borderColor.setStroke()
        // Animate border width transition too
        let borderWidth = hasTimerFinished ? (0.5 + (4.0 - 0.5) * completionColorTransition) : 0.5
        path.lineWidth = borderWidth
        path.stroke()

        if isExpanded {
            if trackInfo != nil {
                // Left side: audio controls (title, artist, buttons)
                // Right side: timer (top) and waveform (below)
                drawAudioMetadataIfNeeded()
                drawProgressBarIfNeeded()
                drawPlaybackButtonsIfNeeded()
                drawTimerTextCompact()
                drawWaveformIfNeeded()
            } else {
                drawTimerOnlyExpandedLayout()
            }
            drawTimerControlButtonsIfNeeded()
            drawBreakLabel()
        } else {
            // Compact layout: timer and audio indicator
            drawCompactLayout()
        }

        // Draw Claude session dots inside the clipped island
        drawClaudeSessionDots()

        context.restoreGState()
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea {
            removeTrackingArea(trackingArea)
        }
        initializeTracking()
    }

}
