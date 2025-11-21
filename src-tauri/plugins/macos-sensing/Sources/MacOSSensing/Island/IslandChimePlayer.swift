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
    private var playerCache: [String: AVAudioPlayer] = [:]
    private var preferences: IslandSoundPreferences = .default
    private var isBootstrapped = false

    func bootstrap() {
        guard !isBootstrapped else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            _ = self.loadPlayer(for: Self.defaultSoundID)
            self.isBootstrapped = true
        }
    }

    func updatePreferences(_ preferences: IslandSoundPreferences) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.preferences = preferences
            _ = self.loadPlayer(for: preferences.soundID)
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
            let player = self.playerCache[soundID] ?? self.loadPlayer(for: soundID)
            guard let player else { return }
            player.currentTime = 0
            player.play()
        }

        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    private func loadPlayer(for soundID: String) -> AVAudioPlayer? {
        if let cached = playerCache[soundID] {
            return cached
        }

        guard let url = Bundle.module.url(forResource: soundID, withExtension: "wav") else {
            NSLog("IslandChimePlayer: missing asset for soundID=%@", soundID)
            return nil
        }

        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = 0
            player.volume = 1.0
            player.prepareToPlay()
            playerCache[soundID] = player
            return player
        } catch {
            NSLog("IslandChimePlayer: failed to load %@ (%@)", soundID, error.localizedDescription)
            return nil
        }
    }
}
