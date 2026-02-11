import Cocoa

extension IslandView {
    /// Draws Claude session dots inside the island.
    /// Compact: grid to the left of waveform/timer.
    /// Expanded: single centered row near the bottom.
    func drawClaudeSessionDots() {
        guard !claudeSessions.isEmpty else { return }

        if isExpanded {
            drawExpandedSessionDots()
        } else {
            drawCompactSessionDots()
        }
    }

    // MARK: - Compact Mode (grid to the left)

    private func drawCompactSessionDots() {
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        let maxDots = min(claudeSessions.count, 8)
        guard maxDots > 0 else { return }

        let dotSize: CGFloat = maxDots <= 4 ? 8.0 : 6.0
        let dotSpacing: CGFloat = 5.0
        let rowSpacing: CGFloat = 4.0
        let leftMargin: CGFloat = 22.0

        let rows: Int = maxDots <= 4 ? 1 : 2
        let topRowCount = maxDots <= 4 ? maxDots : Int(ceil(Double(maxDots) / 2.0))
        let bottomRowCount = maxDots - topRowCount

        // Total grid height for vertical centering
        let gridHeight = CGFloat(rows) * dotSize + CGFloat(max(0, rows - 1)) * rowSpacing
        let gridTopY = notchCenterY + gridHeight / 2.0

        var dotIndex = 0

        for row in 0..<rows {
            let countInRow = row == 0 ? topRowCount : bottomRowCount
            let rowY = gridTopY - CGFloat(row) * (dotSize + rowSpacing) - dotSize

            for col in 0..<countInRow {
                guard dotIndex < maxDots else { break }
                let session = claudeSessions[dotIndex]

                let dotX = leftMargin + CGFloat(col) * (dotSize + dotSpacing)
                let dotRect = NSRect(x: dotX, y: rowY, width: dotSize, height: dotSize)

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
                dotIndex += 1
            }
        }
    }

    // MARK: - Expanded Mode (centered row at bottom)

    private func drawExpandedSessionDots() {
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        let maxDots = min(claudeSessions.count, 8)
        guard maxDots > 0 else { return }

        let dotSize: CGFloat = 6.0
        let dotSpacing: CGFloat = 5.0

        let totalWidth = CGFloat(maxDots) * dotSize + CGFloat(maxDots - 1) * dotSpacing
        let startX = bounds.midX - totalWidth / 2.0
        let centerY: CGFloat = 12.0  // ~12px from bottom

        for i in 0..<maxDots {
            let session = claudeSessions[i]

            let dotX = startX + CGFloat(i) * (dotSize + dotSpacing)
            let dotRect = NSRect(
                x: dotX,
                y: centerY - dotSize / 2.0,
                width: dotSize,
                height: dotSize
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

    // MARK: - Color Helpers

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
