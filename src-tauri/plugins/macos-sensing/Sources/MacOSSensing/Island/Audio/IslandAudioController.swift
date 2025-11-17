import Foundation

protocol IslandAudioControllerDelegate: AnyObject {
    func islandAudioController(_ controller: IslandAudioController, didUpdateTrack track: TrackInfo?)
    func islandAudioController(_ controller: IslandAudioController, didUpdateWaveform bars: [CGFloat])
}

/// Bridges MediaMonitor + WaveformAnimator updates into the island UI.
final class IslandAudioController {
    weak var delegate: IslandAudioControllerDelegate?

    private let mediaMonitor = MediaMonitor.shared
    private let waveformAnimator = WaveformAnimator.shared

    private var currentTrack: TrackInfo?
    private var waveformBars: [CGFloat] = []
    private var monitoring = false

    var activeBundleID: String? {
        mediaMonitor.activeBundleID
    }

    func startMonitoring() {
        guard !monitoring else { return }
        monitoring = true
        mediaMonitor.onTrackChange = { [weak self] track in
            self?.handleTrackChange(track)
        }
        waveformAnimator.onFrame = { [weak self] bars in
            self?.handleWaveformFrame(bars)
        }
        mediaMonitor.startMonitoring()
    }

    func stopMonitoring() {
        guard monitoring else { return }
        monitoring = false
        mediaMonitor.stopMonitoring()
        waveformAnimator.stop()
        mediaMonitor.onTrackChange = nil
        waveformAnimator.onFrame = nil
        waveformBars = []
        currentTrack = nil
    }

    func togglePlayback() {
        mediaMonitor.togglePlayback()
    }

    func skipToNext() {
        mediaMonitor.skipToNext()
    }

    func skipToPrevious() {
        mediaMonitor.skipToPrevious()
    }

    func seek(to position: TimeInterval) {
        guard currentTrack?.canSeek == true else { return }
        mediaMonitor.seek(to: position, bundleID: mediaMonitor.activeBundleID)
    }

    // MARK: - Private

    private func handleTrackChange(_ track: TrackInfo?) {
        currentTrack = track

        if let track {
            waveformAnimator.state = track.isPlaying ? .playing : .paused
            waveformAnimator.start()
        } else {
            waveformAnimator.state = .stopped
            waveformAnimator.stop()
            waveformBars = []
        }

        delegate?.islandAudioController(self, didUpdateTrack: track)
    }

    private func handleWaveformFrame(_ bars: [CGFloat]) {
        guard currentTrack != nil else { return }
        waveformBars = bars
        delegate?.islandAudioController(self, didUpdateWaveform: bars)
    }
}
