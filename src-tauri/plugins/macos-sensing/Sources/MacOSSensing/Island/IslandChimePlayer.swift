import Foundation
import AVFoundation

struct IslandSoundPreferences {
    var enabled: Bool
    var soundID: String

    static let `default` = IslandSoundPreferences(enabled: true, soundID: IslandChimePlayer.defaultSoundID)
}

final class IslandChimePlayer {
    static let shared = IslandChimePlayer()

    static let defaultSoundID = "island_default"

    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!

    private var bufferCache: [String: AVAudioPCMBuffer] = [:]
    private var preferences: IslandSoundPreferences = .default
    private var isBootstrapped = false
    private var isEngineConfigured = false

    func bootstrap() {
        guard !isBootstrapped else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            _ = self.prepareEngineIfNeeded()
            _ = self.buffer(for: Self.defaultSoundID)
            self.isBootstrapped = true
        }
    }

    func updatePreferences(_ preferences: IslandSoundPreferences) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.preferences = preferences
            _ = self.buffer(for: preferences.soundID)
        }
    }

    func playCompletionIfNeeded() {
        guard preferences.enabled else { return }
        play(soundID: preferences.soundID)
    }

    func playPreview(soundID: String) {
        play(soundID: soundID)
    }

    // MARK: - Private

    private func play(soundID: String) {
        let work = { [weak self] in
            guard let self else { return }
            guard self.prepareEngineIfNeeded(), let buffer = self.buffer(for: soundID) else { return }

            self.playerNode.stop()
            self.playerNode.scheduleBuffer(buffer, at: nil, options: .interrupts, completionHandler: nil)
            self.playerNode.play()
        }

        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    private func prepareEngineIfNeeded() -> Bool {
        if !isEngineConfigured {
            engine.attach(playerNode)
            engine.connect(playerNode, to: engine.mainMixerNode, format: format)
            engine.mainMixerNode.outputVolume = 1.0
            isEngineConfigured = true
        }

        if !engine.isRunning {
            do {
                try engine.start()
            } catch {
                NSLog("IslandChimePlayer: failed to start engine (%@)", error.localizedDescription)
                return false
            }
        }

        if !playerNode.isPlaying {
            playerNode.play()
        }

        return true
    }

    private func buffer(for soundID: String) -> AVAudioPCMBuffer? {
        if let cached = bufferCache[soundID] {
            return cached
        }

        let segments = toneSegments(for: soundID)
        guard let buffer = makeBuffer(from: segments) else {
            NSLog("IslandChimePlayer: failed to synthesize soundID=%@", soundID)
            return nil
        }

        bufferCache[soundID] = buffer
        return buffer
    }

    private struct ToneSegment {
        let frequency: Double
        let duration: TimeInterval
        let amplitude: Float
    }

    private func toneSegments(for soundID: String) -> [ToneSegment] {
        switch soundID {
        case "island_soft":
            return [ToneSegment(frequency: 660, duration: 0.7, amplitude: 0.22)]
        case "island_elevator":
            return [
                ToneSegment(frequency: 523.25, duration: 0.28, amplitude: 0.26),
                ToneSegment(frequency: 659.25, duration: 0.34, amplitude: 0.26)
            ]
        case "island_404":
            return [
                ToneSegment(frequency: 330, duration: 0.18, amplitude: 0.24),
                ToneSegment(frequency: 220, duration: 0.16, amplitude: 0.24)
            ]
        case "island_runaway":
            return [ToneSegment(frequency: 987.77, duration: 0.55, amplitude: 0.28)]
        default:
            return [
                ToneSegment(frequency: 880, duration: 0.5, amplitude: 0.30),
                ToneSegment(frequency: 988, duration: 0.25, amplitude: 0.24)
            ]
        }
    }

    private func makeBuffer(from segments: [ToneSegment]) -> AVAudioPCMBuffer? {
        guard !segments.isEmpty else { return nil }

        let sampleRate = format.sampleRate
        let frameCounts = segments.map { max(1, Int(round($0.duration * sampleRate))) }
        let totalFrames = frameCounts.reduce(0, +)

        guard totalFrames > 0 else { return nil }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(totalFrames)) else { return nil }
        buffer.frameLength = AVAudioFrameCount(totalFrames)
        guard let channel = buffer.floatChannelData?.pointee else { return nil }

        var frameIndex = 0
        for (segment, frames) in zip(segments, frameCounts) {
            let fadeSamples = min(Int(sampleRate * 0.01), frames / 2)

            for i in 0..<frames {
                let t = Double(i) / sampleRate
                let raw = sin(2.0 * Double.pi * segment.frequency * t)

                var envelope = 1.0
                if fadeSamples > 0 {
                    let fadeIn = min(1.0, Double(i) / Double(fadeSamples))
                    let fadeOut = min(1.0, Double(frames - 1 - i) / Double(fadeSamples))
                    envelope = min(fadeIn, fadeOut)
                }

                let sample = Float(raw * Double(segment.amplitude) * envelope)
                channel[frameIndex] = sample
                frameIndex += 1
            }
        }

        return buffer
    }
}
