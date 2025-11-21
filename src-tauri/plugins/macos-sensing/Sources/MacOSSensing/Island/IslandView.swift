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
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea {
            removeTrackingArea(trackingArea)
        }
        initializeTracking()
    }
}
