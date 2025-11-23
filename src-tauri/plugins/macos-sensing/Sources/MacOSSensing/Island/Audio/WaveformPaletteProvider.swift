import AppKit
import CoreImage

/// Derives Dynamic Island waveform gradients from track artwork.
final class WaveformPaletteProvider {
    private let ciContext = CIContext(options: [.workingColorSpace: NSNull()])

    private weak var lastArtworkRef: NSImage?
    private var lastTimestamp: Date?
    private var lastGradient: NSGradient?

    func gradient(for track: TrackInfo?) -> NSGradient? {
        guard let track else {
            resetCache()
            return nil
        }

        guard let artwork = track.artwork else {
            resetCache()
            return nil
        }

        if lastArtworkRef === artwork,
           lastTimestamp == track.timestamp,
           let gradient = lastGradient {
            return gradient
        }

        let gradient = makeGradient(from: artwork)
        lastArtworkRef = artwork
        lastTimestamp = track.timestamp
        lastGradient = gradient
        return gradient
    }

    func resetCache() {
        lastArtworkRef = nil
        lastTimestamp = nil
        lastGradient = nil
    }

    private func makeGradient(from artwork: NSImage) -> NSGradient? {
        guard let cgImage = artwork.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return nil
        }

        let ciImage = CIImage(cgImage: cgImage)
        let sliceCount = 4
        var palette: [NSColor] = []

        for index in 0..<sliceCount {
            let sliceWidth = ciImage.extent.width / CGFloat(sliceCount)
            let rect = CGRect(
                x: ciImage.extent.minX + CGFloat(index) * sliceWidth,
                y: ciImage.extent.minY,
                width: sliceWidth,
                height: ciImage.extent.height
            )
            guard let color = averageColor(in: rect, image: ciImage) else { continue }
            palette.append(adjustedColor(color))
        }

        let filtered = normalizePalette(palette)
        guard !filtered.isEmpty else { return nil }
        if filtered.count == 1, let single = filtered.first {
            return NSGradient(colors: [single, pairedColor(for: single)])
        }
        return NSGradient(colors: filtered)
    }

    private func averageColor(in rect: CGRect, image: CIImage) -> NSColor? {
        guard rect.width > 0, rect.height > 0 else { return nil }
        guard let filter = CIFilter(name: "CIAreaAverage") else { return nil }
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(CIVector(cgRect: rect), forKey: kCIInputExtentKey)
        guard let output = filter.outputImage else { return nil }

        var pixel = [UInt8](repeating: 0, count: 4)
        ciContext.render(
            output,
            toBitmap: &pixel,
            rowBytes: 4,
            bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
            format: .RGBA8,
            colorSpace: CGColorSpaceCreateDeviceRGB()
        )

        let alpha = CGFloat(pixel[3]) / 255.0
        guard alpha > 0.01 else { return nil }
        let red = CGFloat(pixel[0]) / 255.0
        let green = CGFloat(pixel[1]) / 255.0
        let blue = CGFloat(pixel[2]) / 255.0
        return NSColor(calibratedRed: red, green: green, blue: blue, alpha: 1.0)
    }

    private func normalizePalette(_ colors: [NSColor]) -> [NSColor] {
        var unique: [NSColor] = []
        var seen = Set<String>()
        for color in colors {
            guard let rgb = color.usingColorSpace(.sRGB) else { continue }
            let key = String(
                format: "%03d-%03d-%03d",
                Int(rgb.redComponent * 255.0),
                Int(rgb.greenComponent * 255.0),
                Int(rgb.blueComponent * 255.0)
            )
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            unique.append(rgb)
        }
        return Array(unique.prefix(4))
    }

    private func pairedColor(for color: NSColor) -> NSColor {
        guard let rgb = color.usingColorSpace(.sRGB) else { return color }
        let luminance = 0.2126 * rgb.redComponent + 0.7152 * rgb.greenComponent + 0.0722 * rgb.blueComponent
        if luminance < 0.5 {
            return rgb.blended(withFraction: 0.45, of: .white) ?? rgb
        } else {
            return rgb.blended(withFraction: 0.45, of: .black) ?? rgb
        }
    }

    private func adjustedColor(_ color: NSColor) -> NSColor {
        guard let rgb = color.usingColorSpace(.sRGB) else { return color }

        var hue: CGFloat = 0
        var saturation: CGFloat = 0
        var brightness: CGFloat = 0
        var alpha: CGFloat = 0
        rgb.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)

        let minBrightness: CGFloat = 0.55
        if brightness < minBrightness {
            let delta = minBrightness - brightness
            brightness = min(1.0, brightness + delta * 0.85 + 0.1)
        }

        let minSaturation: CGFloat = 0.25
        if saturation < minSaturation {
            let delta = minSaturation - saturation
            saturation = min(1.0, saturation + delta * 0.75 + 0.05)
        }

        return NSColor(calibratedHue: hue, saturation: saturation, brightness: brightness, alpha: 1.0)
    }
}
