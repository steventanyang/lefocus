import Cocoa

final class IslandView: NSView {
    private var displayMs: Int64 = 0
    private var mode: IslandMode = .countdown
    private var isIdle: Bool = true
    private var trackingArea: NSTrackingArea?

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

    // MARK: - View lifecycle

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        guard let context = NSGraphicsContext.current?.cgContext else { return }

        context.saveGState()
        defer { context.restoreGState() }

        // Background pill with different appearance for idle vs active
        let path = NSBezierPath(roundedRect: bounds, xRadius: bounds.height / 2.0, yRadius: bounds.height / 2.0)

        // Fully opaque black background
        let backgroundColor = NSColor.black
        backgroundColor.setFill()
        path.fill()

        let borderColor = NSColor.black
        borderColor.setStroke()
        path.lineWidth = 0.5
        path.stroke()

        drawTimerText()
        drawModeIndicatorIfNeeded()
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea {
            removeTrackingArea(trackingArea)
        }
        initializeTracking()
    }

    // MARK: - Private helpers

    private func drawTimerText() {
        let timeString = formatTime(ms: displayMs)

        // Dimmer text color when idle
        let textColor = isIdle
            ? NSColor.white.withAlphaComponent(0.6)
            : NSColor.white

        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 14, weight: .medium),
            .foregroundColor: textColor,
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
        let timeAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 14, weight: .medium),
        ]
        let timeTextSize = NSAttributedString(string: timeString, attributes: timeAttrs).size()
        let padding: CGFloat = 12.0
        let origin = NSPoint(x: padding + timeTextSize.width + 6.0, y: bounds.height / 2.0 - 5.0)
        attributed.draw(at: origin)
    }

    private func initializeTracking() {
        let options: NSTrackingArea.Options = [.mouseEnteredAndExited, .activeAlways, .inVisibleRect]
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
}
