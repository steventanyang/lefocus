import Cocoa

protocol IslandViewInteractionDelegate: AnyObject {
    func islandViewDidRequestToggleExpansion(_ view: IslandView)
    func islandView(_ view: IslandView, hoverChanged isHovered: Bool)
    func islandViewDidRequestCollapse(_ view: IslandView, delay: TimeInterval)
    func islandViewDidCancelCollapseRequest(_ view: IslandView)
    func islandViewDidRequestPlayPause(_ view: IslandView)
    func islandViewDidRequestNext(_ view: IslandView)
    func islandViewDidRequestPrevious(_ view: IslandView)
}

final class IslandView: NSView {
    weak var interactionDelegate: IslandViewInteractionDelegate?

    private var displayMs: Int64 = 0
    private var mode: IslandMode = .countdown
    private var isIdle: Bool = true
    private var trackInfo: TrackInfo?
    private var isAudioPlaying: Bool = false
    private var waveformBars: [CGFloat] = []
    private var trackingArea: NSTrackingArea?
    private var isExpanded: Bool = false
    private var isHovered: Bool = false

    private struct ButtonArea {
        var rect: NSRect = .zero
        var isHovered: Bool = false
    }

    private var playPauseButton = ButtonArea()
    private var previousButton = ButtonArea()
    private var nextButton = ButtonArea()

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
        self.isExpanded = isExpanded
        self.isHovered = isHovered
        if !isExpanded {
            resetButtonAreas()
        }
        needsDisplay = true
    }

    func updateAudio(track: TrackInfo?, waveformBars: [CGFloat]?) {
        self.trackInfo = track
        self.isAudioPlaying = track?.isPlaying ?? false
        if let bars = waveformBars, track != nil {
            self.waveformBars = bars
        } else if track == nil {
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

        // Fully opaque background (slightly lighter when hovered)
        let backgroundColor: NSColor
        if isExpanded {
            backgroundColor = NSColor.black
        } else if isHovered {
            backgroundColor = NSColor(calibratedWhite: 0.1, alpha: 1.0)
        } else {
            backgroundColor = NSColor.black
        }
        backgroundColor.setFill()
        path.fill()

        let borderColor = NSColor.black
        borderColor.setStroke()
        path.lineWidth = 0.5
        path.stroke()

        drawTimerText()
        drawModeIndicatorIfNeeded()
        drawAudioMetadataIfNeeded()
        drawWaveformIfNeeded()
        drawPlaybackButtonsIfNeeded()
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
        let wasHoveringPlay = playPauseButton.isHovered
        let wasHoveringPrev = previousButton.isHovered
        let wasHoveringNext = nextButton.isHovered
        playPauseButton.isHovered = playPauseButton.rect.contains(point)
        previousButton.isHovered = previousButton.rect.contains(point)
        nextButton.isHovered = nextButton.rect.contains(point)
        if wasHoveringPlay != playPauseButton.isHovered ||
            wasHoveringPrev != previousButton.isHovered ||
            wasHoveringNext != nextButton.isHovered {
            needsDisplay = true
        }
    }

    override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)
        if isExpanded {
            layoutPlaybackButtonRects()
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
        }
        interactionDelegate?.islandViewDidRequestToggleExpansion(self)
    }

    // MARK: - Private helpers

    private func createNotchPath() -> NSBezierPath {
        let rect = bounds
        let radius = rect.height / 2.0
        let path = NSBezierPath()
        
        // Start from bottom-left, after the curve
        path.move(to: NSPoint(x: rect.minX + radius, y: rect.minY))
        
        // Bottom edge to bottom-right curve
        path.line(to: NSPoint(x: rect.maxX - radius, y: rect.minY))
        
        // Bottom-right arc (inward curve)
        path.appendArc(withCenter: NSPoint(x: rect.maxX - radius, y: rect.minY + radius),
                      radius: radius,
                      startAngle: 270,
                      endAngle: 0,
                      clockwise: false)
        
        // Right edge
        path.line(to: NSPoint(x: rect.maxX, y: rect.maxY - radius))
        
        // Top-right arc (outward curve) - use negative radius to curve outward
        path.appendArc(withCenter: NSPoint(x: rect.maxX - radius, y: rect.maxY + radius),
                      radius: radius,
                      startAngle: 0,
                      endAngle: 90,
                      clockwise: false)
        
        // Top edge
        path.line(to: NSPoint(x: rect.minX + radius, y: rect.maxY))
        
        // Top-left arc (outward curve) - use negative radius to curve outward
        path.appendArc(withCenter: NSPoint(x: rect.minX + radius, y: rect.maxY + radius),
                      radius: radius,
                      startAngle: 90,
                      endAngle: 180,
                      clockwise: false)
        
        // Left edge
        path.line(to: NSPoint(x: rect.minX, y: rect.minY + radius))
        
        // Bottom-left arc (inward curve)
        path.appendArc(withCenter: NSPoint(x: rect.minX + radius, y: rect.minY + radius),
                      radius: radius,
                      startAngle: 180,
                      endAngle: 270,
                      clockwise: false)
        
        path.close()
        return path
    }

    private func drawTimerText() {
        let timeString = formatTime(ms: displayMs)

        // Dimmer text color when idle
        let textColor = isIdle
            ? NSColor.white.withAlphaComponent(0.6)
            : NSColor.white

        guard let timerFont = IslandView.monospacedFont(size: 13, weight: .medium) else {
            return
        }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: timerFont,
            .foregroundColor: textColor
        ]

        let attributed = NSAttributedString(string: timeString, attributes: attributes)
        let textSize = attributed.size()
        // Left-align the text with some padding from the left edge
        let padding: CGFloat = 12.0
        let origin = NSPoint(
            x: padding,
            y: (bounds.height - textSize.height) / 2.0
        )
        attributed.draw(at: origin)
    }

    private func drawModeIndicatorIfNeeded() {
        guard mode == .stopwatch else { return }

        let indicator = "⏱"
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 10),
            .foregroundColor: NSColor.white.withAlphaComponent(0.65),
        ]
        let attributed = NSAttributedString(string: indicator, attributes: attributes)
        // Position indicator to the right of the timer text
        let timeString = formatTime(ms: displayMs)
        let timeAttrs: [NSAttributedString.Key: Any]
        if let font = IslandView.monospacedFont(size: 13, weight: .medium) {
            timeAttrs = [.font: font]
        } else {
            timeAttrs = [:]
        }
        let timeTextSize = NSAttributedString(string: timeString, attributes: timeAttrs).size()
        let padding: CGFloat = 12.0
        let origin = NSPoint(x: padding + timeTextSize.width + 6.0, y: bounds.height / 2.0 - 5.0)
        attributed.draw(at: origin)
    }

    private func drawAudioMetadataIfNeeded() {
        guard let track = trackInfo else { return }

        if !isExpanded {
            let indicator = "🎵"
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 11, weight: .regular),
                .foregroundColor: NSColor.white.withAlphaComponent(0.8)
            ]
            let string = NSAttributedString(string: indicator, attributes: attrs)
            let origin = NSPoint(
                x: bounds.maxX - string.size().width - 12.0,
                y: bounds.midY - string.size().height / 2.0
            )
            string.draw(at: origin)
            return
        }

        let paddingLeft: CGFloat = 120.0
        let waveformWidth: CGFloat = waveformBars.isEmpty ? 0.0 : 80.0
        let textWidth = max(0, bounds.width - paddingLeft - waveformWidth - 24.0)
        guard textWidth > 0 else { return }

        let title = track.title.isEmpty ? "Unknown" : track.title
        let artist = track.artist.isEmpty ? "Unknown" : track.artist
        let combined = "\(title) — \(artist)"

        let bodyFont = NSFont.systemFont(ofSize: 12, weight: .medium)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: bodyFont,
            .foregroundColor: NSColor.white.withAlphaComponent(isAudioPlaying ? 0.95 : 0.6)
        ]
        let rect = NSRect(
            x: paddingLeft,
            y: bounds.midY - 8.0,
            width: textWidth,
            height: 16.0
        )
        NSString(string: combined).draw(with: rect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: attributes)
    }

    private func drawWaveformIfNeeded() {
        guard isExpanded, trackInfo != nil, !waveformBars.isEmpty else { return }

        let waveformWidth: CGFloat = 80.0
        let waveformHeight = bounds.height - 12.0
        let startX = bounds.maxX - waveformWidth - 12.0
        let baseY = bounds.midY
        let spacing: CGFloat = 2.0
        let barCount = waveformBars.count
        guard barCount > 0 else { return }

        let barWidth = max(1.0, (waveformWidth - CGFloat(barCount - 1) * spacing) / CGFloat(barCount))

        for (index, value) in waveformBars.enumerated() {
            let normalized = max(0.05, min(0.9, value))
            let barHeight = normalized * waveformHeight
            let rect = NSRect(
                x: startX + CGFloat(index) * (barWidth + spacing),
                y: baseY - barHeight / 2.0,
                width: barWidth,
                height: barHeight
            )
            let path = NSBezierPath(roundedRect: rect, xRadius: barWidth / 2.0, yRadius: barWidth / 2.0)
            let alpha: CGFloat = isAudioPlaying ? 0.85 : 0.45
            NSColor.white.withAlphaComponent(alpha).setFill()
            path.fill()
        }
    }

    private func drawPlaybackButtonsIfNeeded() {
        guard isExpanded, trackInfo != nil else {
            resetButtonAreas()
            return
        }

        layoutPlaybackButtonRects()

        drawButton(previousButton, symbol: "⏮", filled: previousButton.isHovered)
        let playSymbol = isAudioPlaying ? "⏸" : "▶"
        drawButton(playPauseButton, symbol: playSymbol, filled: playPauseButton.isHovered, emphasized: true)
        drawButton(nextButton, symbol: "⏭", filled: nextButton.isHovered)
    }

    private func drawButton(_ button: ButtonArea, symbol: String, filled: Bool, emphasized: Bool = false) {
        guard button.rect != .zero else { return }
        let path = NSBezierPath(roundedRect: button.rect, xRadius: button.rect.height / 2.0, yRadius: button.rect.height / 2.0)
        let backgroundColor: NSColor = filled
            ? NSColor.white.withAlphaComponent(0.25)
            : NSColor.white.withAlphaComponent(0.08)
        backgroundColor.setFill()
        path.fill()

        let fontSize: CGFloat = emphasized ? 14.0 : 12.0
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: fontSize, weight: .semibold),
            .foregroundColor: NSColor.white
        ]
        let string = NSAttributedString(string: symbol, attributes: attributes)
        let origin = NSPoint(
            x: button.rect.midX - string.size().width / 2.0,
            y: button.rect.midY - string.size().height / 2.0
        )
        string.draw(at: origin)
    }

    private func layoutPlaybackButtonRects() {
        guard isExpanded else {
            resetButtonAreas()
            return
        }
        let buttonSize = CGSize(width: 32.0, height: 32.0)
        let spacing: CGFloat = 16.0
        let centerY = bounds.midY
        let totalWidth = buttonSize.width * 3 + spacing * 2
        let startX = bounds.midX - totalWidth / 2.0

        previousButton.rect = NSRect(
            x: startX,
            y: centerY - buttonSize.height / 2.0,
            width: buttonSize.width,
            height: buttonSize.height
        )
        playPauseButton.rect = NSRect(
            x: startX + buttonSize.width + spacing,
            y: centerY - buttonSize.height / 2.0,
            width: buttonSize.width,
            height: buttonSize.height
        )
        nextButton.rect = NSRect(
            x: startX + (buttonSize.width + spacing) * 2.0,
            y: centerY - buttonSize.height / 2.0,
            width: buttonSize.width,
            height: buttonSize.height
        )
    }

    private func resetButtonAreas() {
        playPauseButton = ButtonArea()
        previousButton = ButtonArea()
        nextButton = ButtonArea()
    }

    private func initializeTracking() {
        let options: NSTrackingArea.Options = [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect]
        let area = NSTrackingArea(rect: bounds, options: options, owner: self, userInfo: nil)
        addTrackingArea(area)
        trackingArea = area
    }

    private func formatTime(ms: Int64) -> String {
        let totalSeconds = max(Int64(0), ms / 1000)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%02lld:%02lld", minutes, seconds)
    }

    private static func monospacedFont(size: CGFloat, weight: NSFont.Weight) -> NSFont? {
        if #available(macOS 11.0, *) {
            return NSFont.monospacedSystemFont(ofSize: size, weight: weight)
        } else {
            return NSFont.monospacedDigitSystemFont(ofSize: size, weight: weight)
        }
    }
}
