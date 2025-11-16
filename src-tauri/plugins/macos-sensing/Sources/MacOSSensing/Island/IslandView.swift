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
    private var hasTimerFinished: Bool = false
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
    private var lastTimerButtonClickTime: TimeInterval?
    private let timerButtonDebounceInterval: TimeInterval = 0.5  // 500ms

    // Fade animation for expansion
    var expandedContentOpacity: CGFloat = 0.0
    private var fadeAnimationTimer: Timer?
    
    // Progress bar animation
    private var progressBarAnimationTimer: Timer?

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
        self.hasTimerFinished = displayMs <= 0 && !(idle ?? self.isIdle)
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
            stopProgressBarAnimation()
            expandedContentOpacity = 0.0
            resetButtonAreas()
            progressBarArea = ProgressBarArea()
        }

        needsDisplay = true
    }

    func updateAudio(track: TrackInfo?, waveformBars: [CGFloat]?) {
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

    func updateProgressBarOptimistically(to position: TimeInterval) {
        guard let track = trackInfo, track.canSeek else { return }
        progressBarArea.pendingSeekPosition = position
        if !progressBarArea.isDragging {
            progressBarArea.pendingSeekTimestamp = Date()
        }
        trackInfo = track.updatingPlayback(position: position)
        needsDisplay = true
    }

    private func seekPosition(for x: CGFloat, duration: TimeInterval) -> TimeInterval {
        let clampedX = min(max(x, progressBarArea.barRect.minX), progressBarArea.barRect.maxX)
        let relative = (clampedX - progressBarArea.barRect.minX) / progressBarArea.barRect.width
        let progress = min(max(Double(relative), 0.0), 1.0)
        return progress * duration
    }

    private func applyPendingSeekIfNeeded(to track: TrackInfo?) -> TrackInfo? {
        guard let track else {
            progressBarArea.pendingSeekPosition = nil
            progressBarArea.pendingSeekTimestamp = nil
            return nil
        }
        guard track.canSeek else {
            progressBarArea.pendingSeekPosition = nil
            progressBarArea.pendingSeekTimestamp = nil
            return track
        }

        guard let pending = progressBarArea.pendingSeekPosition else {
            return track
        }

        if let actual = track.position,
           !progressBarArea.isDragging {
            let delta = abs(actual - pending)
            let matched = delta < 0.25
            let expired = progressBarArea.pendingSeekTimestamp.map { Date().timeIntervalSince($0) > 1.5 } ?? false
            if matched || expired {
                progressBarArea.pendingSeekPosition = nil
                progressBarArea.pendingSeekTimestamp = nil
                return track
            }
        }

        return track.updatingPlayback(position: pending)
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
            drawProgressBarIfNeeded()
            drawPlaybackButtonsIfNeeded()
            drawTimerTextCompact()
            drawTimerControlButtonsIfNeeded()
            drawWaveformIfNeeded()
            drawBreakLabel()
        } else {
            // Compact layout: timer and audio indicator
            drawCompactLayout()
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
        let wasHoveringProgress = progressBarArea.isHovered

        playPauseButton.isHovered = playPauseButton.rect.contains(point)
        previousButton.isHovered = previousButton.rect.contains(point)
        nextButton.isHovered = nextButton.rect.contains(point)
        timerEndButton.isHovered = timerEndButton.rect.contains(point)
        timerCancelButton.isHovered = timerCancelButton.rect.contains(point)
        let canSeek = progressBarArea.isInteractable
        progressBarArea.isHovered = canSeek && progressBarArea.barRect.contains(point)

        // Handle progress bar hover animation
        if wasHoveringProgress != progressBarArea.isHovered {
            if progressBarArea.isHovered {
                // Instant transition on hover enter
                progressBarArea.animatedHeight = 7.0
                progressBarArea.animatedOpacity = 1.0
                stopProgressBarAnimation()
            } else {
                // Smooth animation on hover exit
                startProgressBarHoverOutAnimation()
            }
        }

        if wasHoveringPlay != playPauseButton.isHovered ||
            wasHoveringPrev != previousButton.isHovered ||
            wasHoveringNext != nextButton.isHovered ||
            wasHoveringEnd != timerEndButton.isHovered ||
            wasHoveringCancel != timerCancelButton.isHovered ||
            wasHoveringProgress != progressBarArea.isHovered {
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

            let extendedHitbox = progressBarArea.barRect.insetBy(dx: 0, dy: -8)
            if progressBarArea.isInteractable,
               progressBarArea.barRect.width > 0,
               extendedHitbox.contains(location),
               let track = trackInfo,
               let duration = track.duration,
               duration > 0 {
                let newPosition = seekPosition(for: location.x, duration: duration)
                progressBarArea.isDragging = true
                progressBarArea.pendingSeekTimestamp = nil
                progressBarArea.pendingSeekPosition = newPosition
                updateProgressBarOptimistically(to: newPosition)
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

    override func mouseDragged(with event: NSEvent) {
        guard isExpanded,
              progressBarArea.isDragging,
              progressBarArea.barRect.width > 0,
              let duration = trackInfo?.duration,
              duration > 0 else {
            return
        }
        let location = convert(event.locationInWindow, from: nil)
        let newPosition = seekPosition(for: location.x, duration: duration)
        progressBarArea.pendingSeekPosition = newPosition
        progressBarArea.pendingSeekTimestamp = nil
        updateProgressBarOptimistically(to: newPosition)
    }

    override func mouseUp(with event: NSEvent) {
        if progressBarArea.isDragging {
            progressBarArea.isDragging = false
            if let position = progressBarArea.pendingSeekPosition {
                progressBarArea.pendingSeekTimestamp = Date()
                interactionDelegate?.islandView(self, didRequestSeek: position)
            }
            return
        }
        super.mouseUp(with: event)
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
    
    // MARK: - Progress Bar Animation
    
    private func startProgressBarHoverOutAnimation() {
        stopProgressBarAnimation()
        
        let startHeight = progressBarArea.animatedHeight
        let startOpacity = progressBarArea.animatedOpacity
        let targetHeight: CGFloat = 6.0
        let targetOpacity: CGFloat = 0.5
        
        let duration: TimeInterval = 0.2 // 200ms animation
        let fps: Double = 60.0
        let frameDuration = 1.0 / fps
        let totalFrames = Int(duration / frameDuration)
        var currentFrame = 0
        
        progressBarAnimationTimer = Timer.scheduledTimer(withTimeInterval: frameDuration, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            
            currentFrame += 1
            let progress = min(1.0, CGFloat(currentFrame) / CGFloat(totalFrames))
            let easedProgress = self.easeOutQuad(progress)
            
            // Interpolate height and opacity
            self.progressBarArea.animatedHeight = startHeight + (targetHeight - startHeight) * easedProgress
            self.progressBarArea.animatedOpacity = startOpacity + (targetOpacity - startOpacity) * easedProgress
            
            self.needsDisplay = true
            
            if currentFrame >= totalFrames {
                self.progressBarArea.animatedHeight = targetHeight
                self.progressBarArea.animatedOpacity = targetOpacity
                self.needsDisplay = true
                timer.invalidate()
                self.progressBarAnimationTimer = nil
            }
        }
    }
    
    private func stopProgressBarAnimation() {
        progressBarAnimationTimer?.invalidate()
        progressBarAnimationTimer = nil
    }

    private enum CompactLayoutState {
        case audioOnly
        case timerActive
        case idle
    }

    private var compactLayoutState: CompactLayoutState {
        if isIdle {
            return trackInfo == nil ? .idle : .audioOnly
        }
        return .timerActive
    }

    private func drawCompactLayout() {
        switch compactLayoutState {
        case .audioOnly:
            drawCompactWaveform(startX: 18.0, centerY: bounds.midY)
            drawCompactArtworkOnRight()
        case .timerActive:
            drawTimerText()
            if trackInfo != nil {
                drawCompactWaveform(startX: 18.0, centerY: bounds.midY)
            }
        case .idle:
            drawCompactWaveform(startX: 18.0, centerY: bounds.midY)
        }
    }

    private func drawCompactArtworkOnRight() {
        guard let track = trackInfo else { return }
        let size = AudioArtworkLayout.compactSize
        let rect = NSRect(
            x: bounds.maxX - size - 12.0,
            y: bounds.midY - size / 2.0,
            width: size,
            height: size
        )
        // Use rounded corners (3px) instead of circle (size/2) for square shape
        drawArtworkImage(track.artwork, in: rect, cornerRadius: 3.0, emphasize: false)
    }
}
