import Cocoa

extension IslandView {
    /// Draws a dark grey shelf below the island with colored dots representing active Claude Code sessions.
    func drawClaudeSessionDots() {
        guard !claudeSessions.isEmpty else { return }
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        let dotDiameter: CGFloat = 6.0
        let dotSpacing: CGFloat = 5.0
        let maxDots = min(claudeSessions.count, 8)

        let totalDotsWidth = CGFloat(maxDots) * dotDiameter + CGFloat(maxDots - 1) * dotSpacing
        let shelfHPadding: CGFloat = 10.0
        let shelfWidth = totalDotsWidth + shelfHPadding * 2.0
        let shelfHeight: CGFloat = 6.5
        let shelfCornerRadius: CGFloat = 4.0

        // Shelf sits at the very bottom of the view
        let shelfRect = NSRect(
            x: bounds.midX - shelfWidth / 2.0,
            y: bounds.minY,
            width: shelfWidth,
            height: shelfHeight
        )

        // Draw shelf background
        let shelfPath = NSBezierPath(roundedRect: shelfRect, xRadius: shelfCornerRadius, yRadius: shelfCornerRadius)
        NSColor(white: 0.13, alpha: 1.0).setFill()
        shelfPath.fill()

        // Center dots inside the shelf
        let baseX = shelfRect.midX - totalDotsWidth / 2.0
        let centerY = shelfRect.midY

        for i in 0..<maxDots {
            let session = claudeSessions[i]

            let dotX = baseX + CGFloat(i) * (dotDiameter + dotSpacing)
            let dotRect = NSRect(
                x: dotX,
                y: centerY - dotDiameter / 2.0,
                width: dotDiameter,
                height: dotDiameter
            )

            let (dotColor, glowColor, alpha) = colorForSession(session)

            context.saveGState()

            if session.state != .done {
                context.setShadow(
                    offset: .zero,
                    blur: 6.0,
                    color: glowColor.withAlphaComponent(0.5 * alpha).cgColor
                )
            }

            let path = NSBezierPath(ovalIn: dotRect)
            dotColor.withAlphaComponent(alpha).setFill()
            path.fill()

            context.restoreGState()
        }
    }

    private func colorForSession(_ session: ClaudeSessionInfo) -> (dot: NSColor, glow: NSColor, alpha: CGFloat) {
        switch session.state {
        case .working:
            let color = NSColor(calibratedRed: 1.0, green: 0.8, blue: 0.0, alpha: 1.0)
            return (color, color, 0.9)
        case .needsAttention:
            let color = completionHighlightColor  // green — waiting for user input
            return (color, color, 0.9)
        case .done:
            let color = NSColor(calibratedRed: 0.3, green: 0.6, blue: 1.0, alpha: 1.0)  // blue
            let fadeStart: Float = 5.0
            let fadeDuration: Float = 3.0
            let alpha: CGFloat
            if session.ageSeconds < fadeStart {
                alpha = 0.9
            } else {
                let progress = CGFloat((session.ageSeconds - fadeStart) / fadeDuration)
                alpha = max(0.0, 0.9 * (1.0 - progress))
            }
            return (color, color, alpha)
        }
    }
}
