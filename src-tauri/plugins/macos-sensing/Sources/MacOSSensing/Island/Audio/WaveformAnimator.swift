import CoreGraphics
import CoreVideo
import Foundation

public enum PlaybackVisualState {
    case playing
    case paused
    case stopped
}

/// Simple waveform animation with 4 random bars.
public final class WaveformAnimator {
    public static let shared = WaveformAnimator()

    private var displayLink: CVDisplayLink?
    private var currentBars: [CGFloat] = [0.1, 0.1, 0.1, 0.1]
    private var targetBars: [CGFloat] = [0.1, 0.1, 0.1, 0.1]
    private var targetUpdateCounter: Int = 0

    public var onFrame: (([CGFloat]) -> Void)?
    public var state: PlaybackVisualState = .stopped
    
    private init() {}

    public func start() {
        guard displayLink == nil else { return }
        var linkRef: CVDisplayLink?
        CVDisplayLinkCreateWithActiveCGDisplays(&linkRef)
        guard let link = linkRef else { return }
        let unmanagedSelf = Unmanaged.passUnretained(self).toOpaque()
        let callback: CVDisplayLinkOutputCallback = { _, _, _, _, _, userInfo in
            guard let userInfo else { return kCVReturnSuccess }
            let animator = Unmanaged<WaveformAnimator>.fromOpaque(userInfo).takeUnretainedValue()
            DispatchQueue.main.async { animator.step() }
            return kCVReturnSuccess
        }
        CVDisplayLinkSetOutputCallback(link, callback, unmanagedSelf)
        CVDisplayLinkStart(link)
        displayLink = link
    }

    public func stop() {
        if let link = displayLink {
            CVDisplayLinkStop(link)
        }
        displayLink = nil
    }

    private func step() {
        // Update targets less frequently (every ~8 frames) for smoother animation
        targetUpdateCounter += 1
        if targetUpdateCounter >= 8 {
            targetUpdateCounter = 0
            // Bigger range: base values allow bars to go much higher
            let base: CGFloat = state == .playing ? 0.2 : state == .paused ? 0.15 : 0.1
            // Random range up to 1.0 (full height) for playing, less for paused/stopped
            let maxRandom: CGFloat = state == .playing ? 0.8 : state == .paused ? 0.4 : 0.2
            targetBars = (0..<4).map { _ in base + CGFloat.random(in: 0...maxRandom) }
        }
        
        // Smooth interpolation towards targets
        currentBars = zip(currentBars, targetBars).map { current, target in
            current * 0.85 + target * 0.15
        }
        onFrame?(currentBars)
    }
}

