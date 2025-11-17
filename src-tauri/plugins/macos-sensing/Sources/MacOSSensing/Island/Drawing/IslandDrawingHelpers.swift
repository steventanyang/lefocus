import Cocoa

extension IslandView {
    // MARK: - Drawing Helpers

    func createNotchPath() -> NSBezierPath {
        let rect = bounds
        // Top corner radius - outward curve (at maxY in AppKit coordinates)
        // Increased from 6.0 to make the curve more obvious
        let topCornerRadius: CGFloat = 10.0
        // Bottom corner radius - larger inward curve (at minY in AppKit coordinates)
        let bottomCornerRadius: CGFloat = 14.0

        // Use Core Graphics path for more control over bezier curves
        let cgPath = CGMutablePath()

        // Start from top-left corner (minX, maxY) - note: maxY is top in AppKit
        cgPath.move(to: CGPoint(x: rect.minX, y: rect.maxY))

        // Top-left corner: outward curve using quadratic bezier
        // Control point at (minX + topRadius, maxY) creates outward curve
        cgPath.addQuadCurve(
            to: CGPoint(x: rect.minX + topCornerRadius, y: rect.maxY - topCornerRadius),
            control: CGPoint(x: rect.minX + topCornerRadius, y: rect.maxY)
        )

        // Left edge - go down to bottom corner
        cgPath.addLine(to: CGPoint(x: rect.minX + topCornerRadius, y: rect.minY + bottomCornerRadius))

        // Bottom-left corner: inward curve using quadratic bezier
        // Control point at (minX + topRadius, minY) creates inward curve
        cgPath.addQuadCurve(
            to: CGPoint(x: rect.minX + topCornerRadius + bottomCornerRadius, y: rect.minY),
            control: CGPoint(x: rect.minX + topCornerRadius, y: rect.minY)
        )

        // Bottom edge
        cgPath.addLine(to: CGPoint(x: rect.maxX - topCornerRadius - bottomCornerRadius, y: rect.minY))

        // Bottom-right corner: inward curve using quadratic bezier
        cgPath.addQuadCurve(
            to: CGPoint(x: rect.maxX - topCornerRadius, y: rect.minY + bottomCornerRadius),
            control: CGPoint(x: rect.maxX - topCornerRadius, y: rect.minY)
        )

        // Right edge - go up to top corner
        cgPath.addLine(to: CGPoint(x: rect.maxX - topCornerRadius, y: rect.maxY - topCornerRadius))

        // Top-right corner: outward curve using quadratic bezier
        // Control point at (maxX - topRadius, maxY) creates outward curve
        cgPath.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.maxY),
            control: CGPoint(x: rect.maxX - topCornerRadius, y: rect.maxY)
        )

        // Close path back to start
        cgPath.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))

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
