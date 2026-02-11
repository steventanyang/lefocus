import Cocoa
import QuartzCore

extension IslandView {
    /// Draws Claude session dots inside the island.
    /// Compact: grid to the left of waveform/timer.
    /// Expanded: single centered row near the bottom.
    func drawClaudeSessionDots() {
        let hasLiveDots = !claudeSessions.isEmpty
        let hasFadingDots = !fadingDots.isEmpty

        guard hasLiveDots || hasFadingDots else { return }

        if isExpanded {
            drawExpandedSessionDots()
        } else {
            drawCompactSessionDots()
        }
    }

    // MARK: - Position Helper

    /// Returns the rect for a dot at the given index within a grid of `count` dots.
    /// Mode determines the layout (compact vs expanded).
    private func dotPosition(index: Int, count: Int, expanded: Bool) -> (rect: NSRect, dotSize: CGFloat) {
        let maxDots = min(count, 8)
        guard maxDots > 0 && index < maxDots else {
            return (.zero, 0)
        }

        let dotSize: CGFloat = maxDots <= 4 ? 8.0 : 6.0
        let dotSpacing: CGFloat = 3.0
        let rowSpacing: CGFloat = 3.0
        let leftMargin: CGFloat = expanded ? 30.0 : 22.0

        let rows: Int = maxDots <= 1 ? 1 : 2
        let topRowCount = maxDots <= 2 ? 1 : Int(ceil(Double(maxDots) / 2.0))

        let gridHeight = CGFloat(rows) * dotSize + CGFloat(max(0, rows - 1)) * rowSpacing

        let gridTopY: CGFloat
        if expanded {
            let gridCenterY = bounds.height - 28.0
            gridTopY = gridCenterY + gridHeight / 2.0
        } else {
            gridTopY = notchCenterY + gridHeight / 2.0
        }

        // Determine which row and column this index falls in
        let row: Int
        let col: Int
        if index < topRowCount {
            row = 0
            col = index
        } else {
            row = 1
            col = index - topRowCount
        }

        let rowY = gridTopY - CGFloat(row) * (dotSize + rowSpacing) - dotSize
        let dotX = leftMargin + CGFloat(col) * (dotSize + dotSpacing)

        return (NSRect(x: dotX, y: rowY, width: dotSize, height: dotSize), dotSize)
    }

    // MARK: - Easing

    private func easeInOutCubic(_ t: CGFloat) -> CGFloat {
        if t < 0.5 {
            return 4.0 * t * t * t
        } else {
            let f = 2.0 * t - 2.0
            return 0.5 * f * f * f + 1.0
        }
    }

    // MARK: - Compact Mode (grid to the left)

    private func drawCompactSessionDots() {
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        let now = CACurrentMediaTime()
        let animating = !fadingDots.isEmpty

        // Build a lookup from PID to old index (for sliding surviving dots)
        var oldIndexByPID: [UInt32: (index: Int, count: Int)] = [:]
        if animating {
            // All fading dots share the same oldCount (the previous total)
            if let first = fadingDots.first {
                let oldCount = first.oldCount
                // Reconstruct old PID order: we know the fading dots' old indices,
                // and surviving dots filled the remaining old indices.
                // We need a map from surviving PIDs to their old indices.
                // The old layout had oldCount dots. Fading dots tell us which indices were removed.
                // We can figure out surviving dots' old indices by matching current sessions
                // against the old session list (which we don't have anymore).
                // Instead, store: for each fading dot we have oldIndex.
                // For surviving dots, we need their old index. We can infer this:
                // The old layout was: claudeSessions (current) + removed sessions, ordered by old index.
                // Since we don't store the old order, we use a simpler heuristic:
                // match current sessions to old indices by their position relative to removed indices.

                let fadingIndices = Set(fadingDots.map { $0.oldIndex })
                var survivingOldIndices: [Int] = []
                for i in 0..<oldCount {
                    if !fadingIndices.contains(i) {
                        survivingOldIndices.append(i)
                    }
                }
                // Map each surviving session (in current order) to its old index
                for (newIdx, session) in claudeSessions.prefix(min(claudeSessions.count, survivingOldIndices.count)).enumerated() {
                    if newIdx < survivingOldIndices.count {
                        oldIndexByPID[session.pid] = (survivingOldIndices[newIdx], oldCount)
                    }
                }
            }
        }

        // Draw fading dots (removed sessions)
        for fadingDot in fadingDots {
            let elapsed = now - fadingDot.startTime
            let rawT = CGFloat(min(elapsed / Self.removalDuration, 1.0))
            let t = easeInOutCubic(rawT)

            let (dotRect, _) = dotPosition(index: fadingDot.oldIndex, count: fadingDot.oldCount, expanded: false)
            let (dotColor, glowColor, baseAlpha) = colorForSession(fadingDot.session)
            let alpha = baseAlpha * (1.0 - t)

            guard alpha > 0.001 else { continue }

            context.saveGState()
            context.setShadow(
                offset: .zero,
                blur: 6.0,
                color: glowColor.withAlphaComponent(0.5 * alpha).cgColor
            )
            let path = NSBezierPath(ovalIn: dotRect)
            dotColor.withAlphaComponent(alpha).setFill()
            path.fill()
            context.restoreGState()
        }

        // Draw surviving (current) dots
        let maxDots = min(claudeSessions.count, 8)
        for dotIndex in 0..<maxDots {
            let session = claudeSessions[dotIndex]
            let (newRect, _) = dotPosition(index: dotIndex, count: claudeSessions.count, expanded: false)

            var drawRect = newRect

            // If animating, interpolate from old position to new position
            if animating, let old = oldIndexByPID[session.pid] {
                let (oldRect, _) = dotPosition(index: old.index, count: old.count, expanded: false)
                // Use the animation progress from the first fading dot
                if let first = fadingDots.first {
                    let elapsed = now - first.startTime
                    let rawT = CGFloat(min(elapsed / Self.removalDuration, 1.0))
                    let t = easeInOutCubic(rawT)
                    drawRect = NSRect(
                        x: oldRect.origin.x + (newRect.origin.x - oldRect.origin.x) * t,
                        y: oldRect.origin.y + (newRect.origin.y - oldRect.origin.y) * t,
                        width: oldRect.width + (newRect.width - oldRect.width) * t,
                        height: oldRect.height + (newRect.height - oldRect.height) * t
                    )
                }
            }

            let (dotColor, glowColor, alpha) = colorForSession(session)

            context.saveGState()
            context.setShadow(
                offset: .zero,
                blur: 6.0,
                color: glowColor.withAlphaComponent(0.5 * alpha).cgColor
            )
            let path = NSBezierPath(ovalIn: drawRect)
            dotColor.withAlphaComponent(alpha).setFill()
            path.fill()
            context.restoreGState()
        }
    }

    // MARK: - Expanded Mode (top-left grid, same stacking as compact)

    private func drawExpandedSessionDots() {
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        let now = CACurrentMediaTime()
        let animating = !fadingDots.isEmpty

        // Build old-index lookup for surviving dots (same logic as compact)
        var oldIndexByPID: [UInt32: (index: Int, count: Int)] = [:]
        if animating, let first = fadingDots.first {
            let oldCount = first.oldCount
            let fadingIndices = Set(fadingDots.map { $0.oldIndex })
            var survivingOldIndices: [Int] = []
            for i in 0..<oldCount {
                if !fadingIndices.contains(i) {
                    survivingOldIndices.append(i)
                }
            }
            for (newIdx, session) in claudeSessions.prefix(min(claudeSessions.count, survivingOldIndices.count)).enumerated() {
                if newIdx < survivingOldIndices.count {
                    oldIndexByPID[session.pid] = (survivingOldIndices[newIdx], oldCount)
                }
            }
        }

        // Draw fading dots
        for fadingDot in fadingDots {
            let elapsed = now - fadingDot.startTime
            let rawT = CGFloat(min(elapsed / Self.removalDuration, 1.0))
            let t = easeInOutCubic(rawT)

            let (dotRect, _) = dotPosition(index: fadingDot.oldIndex, count: fadingDot.oldCount, expanded: true)
            let (dotColor, glowColor, baseAlpha) = colorForSession(fadingDot.session)
            let alpha = baseAlpha * expandedContentOpacity * (1.0 - t)

            guard alpha > 0.001 else { continue }

            context.saveGState()
            context.setShadow(
                offset: .zero,
                blur: 6.0,
                color: glowColor.withAlphaComponent(0.5 * alpha).cgColor
            )
            let path = NSBezierPath(ovalIn: dotRect)
            dotColor.withAlphaComponent(alpha).setFill()
            path.fill()
            context.restoreGState()
        }

        // Draw surviving dots
        let maxDots = min(claudeSessions.count, 8)
        for dotIndex in 0..<maxDots {
            let session = claudeSessions[dotIndex]
            let (newRect, _) = dotPosition(index: dotIndex, count: claudeSessions.count, expanded: true)

            var drawRect = newRect

            if animating, let old = oldIndexByPID[session.pid] {
                let (oldRect, _) = dotPosition(index: old.index, count: old.count, expanded: true)
                if let first = fadingDots.first {
                    let elapsed = now - first.startTime
                    let rawT = CGFloat(min(elapsed / Self.removalDuration, 1.0))
                    let t = easeInOutCubic(rawT)
                    drawRect = NSRect(
                        x: oldRect.origin.x + (newRect.origin.x - oldRect.origin.x) * t,
                        y: oldRect.origin.y + (newRect.origin.y - oldRect.origin.y) * t,
                        width: oldRect.width + (newRect.width - oldRect.width) * t,
                        height: oldRect.height + (newRect.height - oldRect.height) * t
                    )
                }
            }

            let (dotColor, glowColor, alpha) = colorForSession(session)
            let fadeAlpha = alpha * expandedContentOpacity

            context.saveGState()
            context.setShadow(
                offset: .zero,
                blur: 6.0,
                color: glowColor.withAlphaComponent(0.5 * fadeAlpha).cgColor
            )
            let path = NSBezierPath(ovalIn: drawRect)
            dotColor.withAlphaComponent(fadeAlpha).setFill()
            path.fill()
            context.restoreGState()
        }
    }

    // MARK: - Color Helpers

    /// Pulsing alpha for the thinking state (sine wave: 0.5–0.9 over 1.5s period).
    func thinkingPulseAlpha() -> CGFloat {
        let time = CACurrentMediaTime()
        let period: Double = 1.5
        return 0.7 + 0.2 * CGFloat(sin(time * 2.0 * .pi / period))
    }

    private func colorForSession(_ session: ClaudeSessionInfo) -> (dot: NSColor, glow: NSColor, alpha: CGFloat) {
        switch session.state {
        case .thinking:
            let color = NSColor(calibratedRed: 1.0, green: 0.8, blue: 0.0, alpha: 1.0)  // yellow
            return (color, color, thinkingPulseAlpha())
        case .executing:
            let color = NSColor(calibratedRed: 1.0, green: 0.55, blue: 0.0, alpha: 1.0)  // orange
            return (color, color, 0.9)
        case .waiting:
            let color = completionHighlightColor  // green — waiting for user input
            return (color, color, 0.9)
        case .done:
            let color = completionHighlightColor  // green
            return (color, color, 0.0) // Done dots are now handled as fading dots
        }
    }
}
