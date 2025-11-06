import Cocoa

final class IslandView: NSView {
    private var displayMs: Int64 = 0
    private var mode: IslandMode = .countdown
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

    func update(displayMs: Int64, mode: IslandMode?) {
        self.displayMs = displayMs
        if let mode {
            self.mode = mode
        }
        needsDisplay = true
    }

    // MARK: - View lifecycle

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        guard let context = NSGraphicsContext.current?.cgContext else { return }

        context.saveGState()
        defer { context.restoreGState() }

        // Background pill
        let path = NSBezierPath(roundedRect: bounds, xRadius: bounds.height / 2.0, yRadius: bounds.height / 2.0)
        NSColor(white: 0.1, alpha: 0.95).setFill()
        path.fill()

        NSColor(white: 0.2, alpha: 1.0).setStroke()
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
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 16, weight: .medium),
            .foregroundColor: NSColor.white,
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
            .font: NSFont.monospacedSystemFont(ofSize: 16, weight: .medium),
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
