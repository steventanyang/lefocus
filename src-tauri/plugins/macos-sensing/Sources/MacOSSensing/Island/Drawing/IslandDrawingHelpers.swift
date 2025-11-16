import Cocoa

extension IslandView {
    // MARK: - Drawing Helpers

    func createNotchPath() -> NSBezierPath {
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

    func formatTime(ms: Int64) -> String {
        let totalSeconds = max(Int64(0), ms / 1000)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%02lld:%02lld", minutes, seconds)
    }

    static func monospacedFont(size: CGFloat, weight: NSFont.Weight) -> NSFont? {
        if #available(macOS 11.0, *) {
            return NSFont.monospacedSystemFont(ofSize: size, weight: weight)
        } else {
            return NSFont.monospacedDigitSystemFont(ofSize: size, weight: weight)
        }
    }

    func resetButtonAreas() {
        playPauseButton = ButtonArea()
        previousButton = ButtonArea()
        nextButton = ButtonArea()
        timerEndButton = ButtonArea()
        timerCancelButton = ButtonArea()
        progressBarArea = ProgressBarArea()
    }
}
