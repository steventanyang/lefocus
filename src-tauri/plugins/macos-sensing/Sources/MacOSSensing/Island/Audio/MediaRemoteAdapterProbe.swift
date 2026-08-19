import AppKit
import Foundation
import MediaRemoteAdapter
import MachO

/// Bridges the entitled Perl-based MediaRemote adapter into the Island's media model.
final class MediaRemoteAdapterProbe {
    static let sourceIdentifier = "system.now-playing"

    struct Snapshot {
        let track: TrackInfo
    }

    private lazy var controller = MediaController(
        libraryPath: Self.adapterLibraryPath(),
        perlScriptPath: Self.perlScriptPath()
    )
    private let stateLock = NSLock()
    private var latestTrack: MediaRemoteAdapter.TrackInfo?
    private var isMonitoring = false

    private static func macOSSensingLibraryDirectory() -> URL? {
        for index in 0..<_dyld_image_count() {
            guard let imageName = _dyld_get_image_name(index) else { continue }
            let path = String(cString: imageName)
            if URL(fileURLWithPath: path).lastPathComponent == "libMacOSSensing.dylib" {
                return URL(fileURLWithPath: path).deletingLastPathComponent()
            }
        }
        return nil
    }

    private static func adapterLibraryPath() -> String? {
        let path = macOSSensingLibraryDirectory()?
            .appendingPathComponent("libMediaRemoteAdapter.dylib").path
        if let path, FileManager.default.fileExists(atPath: path) { return path }
        NSLog("[MediaRemoteAdapter] helper dylib is missing near libMacOSSensing.dylib")
        return nil
    }

    private static func perlScriptPath() -> String? {
        let bundleName = "MediaRemoteAdapter_MediaRemoteAdapter.bundle"
        let candidates = [
            Bundle.main.resourceURL?
                .appendingPathComponent(bundleName)
                .appendingPathComponent("run.pl"),
            macOSSensingLibraryDirectory()?
                .appendingPathComponent(bundleName)
                .appendingPathComponent("run.pl")
        ].compactMap { $0 }

        if let script = candidates.first(where: {
            FileManager.default.fileExists(atPath: $0.path)
        }) {
            return script.path
        }
        NSLog("[MediaRemoteAdapter] run.pl is missing from the app resources")
        return nil
    }

    init() {
        controller.onTrackInfoReceived = { [weak self] track in
            guard let self else { return }
            self.stateLock.lock()
            self.latestTrack = track
            self.stateLock.unlock()
        }

        controller.onDecodingError = { error, _ in
            NSLog("[MediaRemoteAdapter] failed to decode update: %@", error.localizedDescription)
        }

        controller.onListenerTerminated = { [weak self] in
            guard let self, self.isMonitoring else { return }
            NSLog("[MediaRemoteAdapter] listener stopped; restarting")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                guard let self, self.isMonitoring else { return }
                self.controller.startListening()
            }
        }
    }

    func startMonitoring() {
        guard !isMonitoring else { return }
        isMonitoring = true
        controller.startListening()
    }

    func stopMonitoring() {
        isMonitoring = false
        controller.stopListening()
        stateLock.lock()
        latestTrack = nil
        stateLock.unlock()
    }

    func snapshot() -> Snapshot? {
        stateLock.lock()
        let adapterTrack = latestTrack
        stateLock.unlock()

        guard let payload = adapterTrack?.payload else { return nil }
        let title = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let artist = payload.artist?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let album = payload.album?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !title.isEmpty else { return nil }

        let duration = payload.durationMicros.map { $0 / 1_000_000 }
        let position = payload.currentElapsedTime.map { max(0, $0) }
        let track = TrackInfo(
            title: title,
            artist: artist.isEmpty ? (album.isEmpty ? "Unknown" : album) : artist,
            artwork: payload.artwork,
            isPlaying: payload.isPlaying ?? ((payload.playbackRate ?? 0) > 0.01),
            sourceBundleID: Self.sourceIdentifier,
            position: position,
            duration: duration,
            canSeek: position != nil && duration != nil
        )

        return Snapshot(track: track)
    }

    func togglePlayback() {
        controller.togglePlayPause()
    }

    func skipToNext() {
        controller.nextTrack()
    }

    func skipToPrevious() {
        controller.previousTrack()
    }

    func seek(to position: TimeInterval) {
        controller.setTime(seconds: max(0, position))
    }
}
