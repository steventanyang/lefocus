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
}

final class IslandView: NSView {
    weak var interactionDelegate: IslandViewInteractionDelegate?

    var displayMs: Int64 = 0
    var mode: IslandMode = .countdown
    var isIdle: Bool = true
    var trackInfo: TrackInfo?
    var isAudioPlaying: Bool = false
    var waveformBars: [CGFloat] = []
    private var trackingArea: NSTrackingArea?
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

    // Debouncing for timer control buttons
    private var lastTimerButtonClickTime: TimeInterval?
    private let timerButtonDebounceInterval: TimeInterval = 0.5  // 500ms

    // Fade animation for expansion
    var expandedContentOpacity: CGFloat = 0.0
    private var fadeAnimationTimer: Timer?

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
        self.displayMs = displayMs
        if let mode {
            self.mode = mode
        }
        if let idle {
            self.isIdle = idle
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
            expandedContentOpacity = 0.0
            resetButtonAreas()
        }

        needsDisplay = true
    }

    func updateAudio(track: TrackInfo?, waveformBars: [CGFloat]?) {
        let hadArtwork = self.trackInfo?.artwork != nil
        let hasArtwork = track?.artwork != nil

        self.trackInfo = track
        self.isAudioPlaying = track?.isPlaying ?? false
        if let bars = waveformBars, track != nil {
            self.waveformBars = bars
        } else if track == nil {
            self.waveformBars = []
        }

        if hasArtwork != hadArtwork {
            NSLog("IslandView: Artwork state changed - had: \(hadArtwork), has: \(hasArtwork), track: \(track?.title ?? "nil")")
        }

        needsDisplay = true
    }

    // MARK: - View lifecycle

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        guard let context = NSGraphicsContext.current?.cgContext else { return }

        context.saveGState()
        defer { context.restoreGState() }

        // Notch-shaped path: bottom corners curve inward, top corners curve outward
        let path = createNotchPath()

        // Clip to the notch path before drawing gradient
        path.addClip()

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

        // Reset clip and draw border
        context.resetClip()
        path.addClip()

        let borderColor = NSColor.black
        borderColor.setStroke()
        path.lineWidth = 0.5
        path.stroke()

        if isExpanded && trackInfo != nil {
            // Left side: audio controls (title, artist, buttons)
            // Right side: timer (top) and waveform (below)
            drawAudioMetadataIfNeeded()
            drawPlaybackButtonsIfNeeded()
            drawTimerTextCompact()
            drawTimerControlButtonsIfNeeded()
            drawWaveformIfNeeded()
            drawBreakLabel()
        } else {
            // Compact layout: timer and audio indicator
            drawTimerText()
            drawAudioMetadataIfNeeded()
        }
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea {
            removeTrackingArea(trackingArea)
        }
        initializeTracking()
    }

    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        interactionDelegate?.islandView(self, hoverChanged: true)
        interactionDelegate?.islandViewDidCancelCollapseRequest(self)
        needsDisplay = true
    }

    override func mouseExited(with event: NSEvent) {
        isHovered = false
        interactionDelegate?.islandView(self, hoverChanged: false)
        if isExpanded {
            interactionDelegate?.islandViewDidRequestCollapse(self, delay: 0.3)
        }
        needsDisplay = true
    }

    override func mouseMoved(with event: NSEvent) {
        guard isExpanded else { return }
        let point = convert(event.locationInWindow, from: nil)
        layoutPlaybackButtonRects()
        layoutTimerControlButtonRects()

        let wasHoveringPlay = playPauseButton.isHovered
        let wasHoveringPrev = previousButton.isHovered
        let wasHoveringNext = nextButton.isHovered
        let wasHoveringEnd = timerEndButton.isHovered
        let wasHoveringCancel = timerCancelButton.isHovered

        playPauseButton.isHovered = playPauseButton.rect.contains(point)
        previousButton.isHovered = previousButton.rect.contains(point)
        nextButton.isHovered = nextButton.rect.contains(point)
        timerEndButton.isHovered = timerEndButton.rect.contains(point)
        timerCancelButton.isHovered = timerCancelButton.rect.contains(point)

        if wasHoveringPlay != playPauseButton.isHovered ||
            wasHoveringPrev != previousButton.isHovered ||
            wasHoveringNext != nextButton.isHovered ||
            wasHoveringEnd != timerEndButton.isHovered ||
            wasHoveringCancel != timerCancelButton.isHovered {
            needsDisplay = true
        }
    }

    override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)
        if isExpanded {
            layoutPlaybackButtonRects()
            layoutTimerControlButtonRects()

            if playPauseButton.rect.contains(location) {
                interactionDelegate?.islandViewDidRequestPlayPause(self)
                return
            }
            if previousButton.rect.contains(location) {
                interactionDelegate?.islandViewDidRequestPrevious(self)
                return
            }
            if nextButton.rect.contains(location) {
                interactionDelegate?.islandViewDidRequestNext(self)
                return
            }

            // Debounce timer control buttons to prevent double-click issues
            if timerEndButton.rect.contains(location) || timerCancelButton.rect.contains(location) {
                let now = Date().timeIntervalSince1970
                if let lastClick = lastTimerButtonClickTime,
                   now - lastClick < timerButtonDebounceInterval {
                    return  // Debounce: ignore rapid clicks
                }
                lastTimerButtonClickTime = now

                if timerEndButton.rect.contains(location) {
                    interactionDelegate?.islandViewDidRequestEndTimer(self)
                    return
                }
                if timerCancelButton.rect.contains(location) {
                    interactionDelegate?.islandViewDidRequestCancelTimer(self)
                    return
                }
            }
        }
        interactionDelegate?.islandViewDidRequestToggleExpansion(self)
    }

    // MARK: - Private helpers

    private func initializeTracking() {
        let options: NSTrackingArea.Options = [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect]
        let area = NSTrackingArea(rect: bounds, options: options, owner: self, userInfo: nil)
        addTrackingArea(area)
        trackingArea = area
    }

    // MARK: - Fade Animation

    private func startFadeInAnimation() {
        stopFadeAnimation()
        expandedContentOpacity = 0.0

        let duration: TimeInterval = 0.2 // 200ms fade-in
        let fps: Double = 60.0
        let frameDuration = 1.0 / fps
        let totalFrames = Int(duration / frameDuration)
        var currentFrame = 0

        fadeAnimationTimer = Timer.scheduledTimer(withTimeInterval: frameDuration, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }

            currentFrame += 1
            let progress = min(1.0, CGFloat(currentFrame) / CGFloat(totalFrames))

            // Ease-out animation for smoother feel
            self.expandedContentOpacity = self.easeOutQuad(progress)

            self.needsDisplay = true

            if currentFrame >= totalFrames {
                self.expandedContentOpacity = 1.0
                self.needsDisplay = true
                timer.invalidate()
                self.fadeAnimationTimer = nil
            }
        }
    }

    private func stopFadeAnimation() {
        fadeAnimationTimer?.invalidate()
        fadeAnimationTimer = nil
    }

    private func easeOutQuad(_ t: CGFloat) -> CGFloat {
        return t * (2.0 - t)
    }
}
