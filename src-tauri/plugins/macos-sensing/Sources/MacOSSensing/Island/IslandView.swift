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

        // Background - translucent when expanded, opaque when compact
        let backgroundColor = isExpanded 
            ? NSColor.black.withAlphaComponent(0.85)
            : NSColor.black
        backgroundColor.setFill()
        path.fill()

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
            drawWaveformIfNeeded()
        } else {
            // Compact layout: timer and audio indicator
            drawTimerText()
            drawModeIndicatorIfNeeded()
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
        // Fixed bottom corner radius (based on compact height of 36px)
        let bottomRadius: CGFloat = 18.0
        // Top corners scale with height for the bulge effect
        let topRadius = rect.height / 2.0
        
        // Use Core Graphics path for more control over bezier curves
        let cgPath = CGMutablePath()
        
        // Start from bottom-left, after the curve
        cgPath.move(to: CGPoint(x: rect.minX + bottomRadius, y: rect.minY))
        
        // Bottom edge to bottom-right curve
        cgPath.addLine(to: CGPoint(x: rect.maxX - bottomRadius, y: rect.minY))
        
        // Bottom-right arc (inward curve) - using fixed radius
        cgPath.addArc(center: CGPoint(x: rect.maxX - bottomRadius, y: rect.minY + bottomRadius),
                     radius: bottomRadius,
                     startAngle: .pi * 1.5,  // 270 degrees
                     endAngle: 0,
                     clockwise: false)
        
        // Right edge - go up to where we want the bulge to start
        cgPath.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - topRadius * 0.7))
        
        // Top-right corner: create outward bulge using quadratic bezier
        // Control point positioned well outside to create visible outward curve
        let bulgeAmount: CGFloat = topRadius * 4.0  // Very pronounced bulge
        let topRightControl = CGPoint(x: rect.maxX + bulgeAmount, y: rect.maxY + bulgeAmount * 0.7)
        let topRightEnd = CGPoint(x: rect.maxX - topRadius * 0.7, y: rect.maxY)
        cgPath.addQuadCurve(to: topRightEnd, control: topRightControl)
        
        // Top edge
        cgPath.addLine(to: CGPoint(x: rect.minX + topRadius * 0.7, y: rect.maxY))
        
        // Top-left corner: create outward bulge using quadratic bezier
        let topLeftControl = CGPoint(x: rect.minX - bulgeAmount, y: rect.maxY + bulgeAmount * 0.7)
        let topLeftEnd = CGPoint(x: rect.minX, y: rect.maxY - topRadius * 0.7)
        cgPath.addQuadCurve(to: topLeftEnd, control: topLeftControl)
        
        // Left edge
        cgPath.addLine(to: CGPoint(x: rect.minX, y: rect.minY + bottomRadius))
        
        // Bottom-left arc (inward curve) - using fixed radius
        cgPath.addArc(center: CGPoint(x: rect.minX + bottomRadius, y: rect.minY + bottomRadius),
                     radius: bottomRadius,
                     startAngle: .pi,  // 180 degrees
                     endAngle: .pi * 1.5,  // 270 degrees
                     clockwise: false)
        
        cgPath.closeSubpath()
        
        // Convert CGPath to NSBezierPath using the cgPath property
        return NSBezierPath(cgPath: cgPath)
    }

    private func drawTimerText() {
        let timeString = formatTime(ms: displayMs)

        // Darker when not hovered, white when hovered
        let textColor: NSColor
        if isIdle {
            textColor = isHovered 
                ? NSColor.white.withAlphaComponent(0.6)
                : NSColor.white.withAlphaComponent(0.3)
        } else {
            textColor = isHovered
                ? NSColor.white
                : NSColor.white.withAlphaComponent(0.4)
        }

        guard let timerFont = IslandView.monospacedFont(size: 13, weight: .medium) else {
            return
        }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: timerFont,
            .foregroundColor: textColor
        ]

        let attributed = NSAttributedString(string: timeString, attributes: attributes)
        let textSize = attributed.size()
        // Right-align the text with some padding from the right edge
        let padding: CGFloat = 12.0
        let origin = NSPoint(
            x: bounds.maxX - textSize.width - padding,
            y: (bounds.height - textSize.height) / 2.0
        )
        attributed.draw(at: origin)
    }

    private func drawTimerTextCompact() {
        guard !isIdle else { return }
        let timeString = formatTime(ms: displayMs)

        // Larger font, moved up to align with top of song name
        guard let timerFont = IslandView.monospacedFont(size: 18, weight: .semibold) else {
            return
        }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: timerFont,
            .foregroundColor: NSColor.white.withAlphaComponent(0.9)
        ]

        let attributed = NSAttributedString(string: timeString, attributes: attributes)
        let textSize = attributed.size()
        // Right side, aligned with top of track title (moved up)
        let origin = NSPoint(
            x: bounds.maxX - textSize.width - 16.0,
            y: bounds.height - textSize.height - 46.0  // Moved up to align with title top
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
        // Position indicator to the left of the timer text (since timer is now on right)
        let timeString = formatTime(ms: displayMs)
        let timeAttrs: [NSAttributedString.Key: Any]
        if let font = IslandView.monospacedFont(size: 13, weight: .medium) {
            timeAttrs = [.font: font]
        } else {
            timeAttrs = [:]
        }
        let timeTextSize = NSAttributedString(string: timeString, attributes: timeAttrs).size()
        let padding: CGFloat = 12.0
        let origin = NSPoint(x: bounds.maxX - timeTextSize.width - padding - attributed.size().width - 6.0, y: bounds.height / 2.0 - 5.0)
        attributed.draw(at: origin)
    }

    private func drawAudioMetadataIfNeeded() {
        guard let track = trackInfo else { return }

        if !isExpanded {
            // Draw 4 thicker waveform pills instead of music note emoji
            drawCompactWaveform()
            return
        }

        // Left-aligned layout: title and artist stacked on left side
        let title = track.title.isEmpty ? "Unknown" : track.title
        let artist = track.artist.isEmpty ? "Unknown" : track.artist
        
        // Title: left side, with more space below waveform
        let titleFont = NSFont.systemFont(ofSize: 14, weight: .semibold)
        let titleAttrs: [NSAttributedString.Key: Any] = [
            .font: titleFont,
            .foregroundColor: NSColor.white.withAlphaComponent(isAudioPlaying ? 0.95 : 0.9)
        ]
        // Calculate timer width to position title correctly (leave space for timer on right)
        let timeString = formatTime(ms: displayMs)
        let timerFont = IslandView.monospacedFont(size: 18, weight: .semibold)
        let timerAttrs: [NSAttributedString.Key: Any] = timerFont.map { [.font: $0] } ?? [:]
        let timerWidth = NSAttributedString(string: timeString, attributes: timerAttrs).size().width
        let titleRect = NSRect(
            x: 16.0,
            y: bounds.height - 56.0,  // Moved down to create more space below waveform
            width: bounds.width - timerWidth - 32.0, // Leave space for timer on right
            height: 18.0
        )
        NSString(string: title).draw(with: titleRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: titleAttrs)
        
        // Artist: below title
        let artistFont = NSFont.systemFont(ofSize: 12, weight: .regular)
        let artistAttrs: [NSAttributedString.Key: Any] = [
            .font: artistFont,
            .foregroundColor: NSColor.white.withAlphaComponent(0.7)
        ]
        let artistRect = NSRect(
            x: 16.0,
            y: bounds.height - 76.0,  // Adjusted to maintain spacing
            width: bounds.width - timerWidth - 32.0,
            height: 16.0
        )
        NSString(string: artist).draw(with: artistRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: artistAttrs)
    }

    private func drawCompactWaveform() {
        guard !waveformBars.isEmpty, waveformBars.count == 4 else { return }
        
        // Match the width of the music note emoji (size 11 font)
        let emojiString = NSAttributedString(string: "🎵", attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .regular)
        ])
        let emojiWidth = emojiString.size().width
        let totalWidth = emojiWidth
        let spacing: CGFloat = 3.0
        let pillWidth = (totalWidth - spacing * 3.0) / 4.0
        let pillHeight: CGFloat = 12.0
        let startX = 12.0 // Left side padding
        let centerY = bounds.midY
        
        for (index, value) in waveformBars.enumerated() {
            // Allow full range: 0.0 to 1.0 (removed min clamp to allow bars to go higher)
            let normalized = min(1.0, value)
            let height = normalized * pillHeight
            let rect = NSRect(
                x: startX + CGFloat(index) * (pillWidth + spacing),
                y: centerY - height / 2.0,
                width: pillWidth,
                height: height
            )
            let path = NSBezierPath(roundedRect: rect, xRadius: pillWidth / 2.0, yRadius: pillWidth / 2.0)
            let alpha: CGFloat = isAudioPlaying ? 0.8 : 0.5
            NSColor.white.withAlphaComponent(alpha).setFill()
            path.fill()
        }
    }

    private func drawWaveformIfNeeded() {
        guard isExpanded, trackInfo != nil, !waveformBars.isEmpty, waveformBars.count == 4 else { return }

        // Waveform in top-left corner when expanded
        let emojiString = NSAttributedString(string: "🎵", attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .regular)
        ])
        let emojiWidth = emojiString.size().width
        let totalWidth = emojiWidth
        let spacing: CGFloat = 3.0
        let pillWidth = (totalWidth - spacing * 3.0) / 4.0
        let pillHeight: CGFloat = 12.0
        let startX = 16.0 // Left padding
        let baseY: CGFloat = bounds.height - 20.0 // Top-left corner, near the top

        for (index, value) in waveformBars.enumerated() {
            // Allow full range: 0.0 to 1.0 (removed min clamp to allow bars to go higher)
            let normalized = min(1.0, value)
            let height = normalized * pillHeight
            let rect = NSRect(
                x: startX + CGFloat(index) * (pillWidth + spacing),
                y: baseY - height / 2.0,
                width: pillWidth,
                height: height
            )
            let path = NSBezierPath(roundedRect: rect, xRadius: pillWidth / 2.0, yRadius: pillWidth / 2.0)
            let alpha: CGFloat = isAudioPlaying ? 0.7 : 0.35
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
        
        // No circle background, just icon
        // Scale icon larger when hovered
        let baseFontSize: CGFloat = emphasized ? 20.0 : 18.0
        let fontSize = button.isHovered ? baseFontSize * 1.2 : baseFontSize
        
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
        // Buttons on left side, below track info
        let buttonSize = CGSize(width: 36.0, height: 36.0)
        let spacing: CGFloat = 12.0
        let bottomY: CGFloat = 20.0 // Position from bottom
        let startX: CGFloat = 16.0 // Left padding, aligned with track info

        previousButton.rect = NSRect(
            x: startX,
            y: bottomY,
            width: buttonSize.width,
            height: buttonSize.height
        )
        playPauseButton.rect = NSRect(
            x: startX + buttonSize.width + spacing,
            y: bottomY,
            width: buttonSize.width,
            height: buttonSize.height
        )
        nextButton.rect = NSRect(
            x: startX + (buttonSize.width + spacing) * 2.0,
            y: bottomY,
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
