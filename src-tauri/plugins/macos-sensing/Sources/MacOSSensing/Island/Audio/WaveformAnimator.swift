import CoreGraphics
import CoreVideo
import Foundation
import QuartzCore

public enum PlaybackVisualState {
    case playing
    case paused
    case stopped
}

/// Procedural waveform animation that drives the audio visualization.
public final class WaveformAnimator {
    public static let shared = WaveformAnimator()

    private let barCount = 20
    private var displayLink: CVDisplayLink?

    private var currentBars: [CGFloat]
    private var targetBars: [CGFloat]
    private var phase: CGFloat = 0

    public var onFrame: (([CGFloat]) -> Void)?

    public var state: PlaybackVisualState = .stopped {
        didSet { updateTargetsForState() }
    }

    private init() {
        currentBars = Array(repeating: 0.05, count: barCount)
        targetBars = Array(repeating: 0.05, count: barCount)
    }

    public func start() {
        guard displayLink == nil else { return }
        updateTargetsForState()
        var linkRef: CVDisplayLink?
        CVDisplayLinkCreateWithActiveCGDisplays(&linkRef)
        guard let link = linkRef else { return }
        let unmanagedSelf = Unmanaged.passUnretained(self).toOpaque()
        let callback: CVDisplayLinkOutputCallback = { _, _, _, _, _, userInfo in
            guard let userInfo else { return kCVReturnSuccess }
            let animator = Unmanaged<WaveformAnimator>.fromOpaque(userInfo).takeUnretainedValue()
            animator.stepOnDisplayLink()
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

    private func stepOnDisplayLink() {
        DispatchQueue.main.async { [weak self] in
            self?.step()
        }
    }

    @objc private func step() {
        phase += 0.12

        for index in 0..<barCount {
            let noise = CGFloat.random(in: -0.15...0.15)
            let wave = sin(phase + CGFloat(index) * 0.4)
            let base = targetBars[index]
            let next = base + wave * 0.1 + noise
            currentBars[index] = currentBars[index] * 0.7 + max(0.05, next) * 0.3
        }

        onFrame?(currentBars)
    }

    private func updateTargetsForState() {
        switch state {
        case .playing:
            targetBars = (0..<barCount).map { index in
                0.4 + 0.25 * sin(CGFloat(index) * 0.3)
            }
        case .paused:
            targetBars = Array(repeating: 0.15, count: barCount)
        case .stopped:
            targetBars = Array(repeating: 0.05, count: barCount)
        }
    }
}
