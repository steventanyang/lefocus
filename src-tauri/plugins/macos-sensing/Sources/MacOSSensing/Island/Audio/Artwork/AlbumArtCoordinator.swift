import AppKit
import CryptoKit
import Foundation

enum ArtworkHint: Hashable {
    case appleMusicBase64(String)

    var cacheComponent: String {
        switch self {
        case let .appleMusicBase64(base64):
            return "music-\(ArtworkHint.hashedComponent(for: base64))"
        }
    }

    private static func hashedComponent(for string: String) -> String {
        guard let data = string.data(using: .utf8) else {
            return UUID().uuidString
        }
        let digest = SHA256.hash(data: data)
        return digest.prefix(12).map { String(format: "%02x", $0) }.joined()
    }
}

struct ArtworkRequest: Hashable {
    let title: String
    let artist: String
    let bundleID: String?
    let hint: ArtworkHint
    let timestamp: Date

    var cacheKey: String {
        let normalizedTitle = title.lowercased()
        let normalizedArtist = artist.lowercased()
        let source = bundleID ?? "generic"
        let rawKey = "\(source)|\(normalizedTitle)|\(normalizedArtist)|\(hint.cacheComponent)"
        return ArtworkRequest.sanitizedKey(from: rawKey)
    }

    private static func sanitizedKey(from raw: String) -> String {
        guard let data = raw.data(using: .utf8) else {
            return UUID().uuidString
        }

        return data.base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
    }
}

struct ArtworkResult {
    let request: ArtworkRequest
    let image: NSImage?
}

/// Fetches and caches album artwork from different media sources.
final class AlbumArtCoordinator {
    static let shared = AlbumArtCoordinator()
    private static let maxDiskBytes = 50 * 1024 * 1024
    private static let maxDiskAge: TimeInterval = 60 * 24 * 60 * 60

    private typealias Completion = (NSImage?) -> Void

    private let memoryCache = NSCache<NSString, NSImage>()
    private let fetchQueue: OperationQueue
    private let diskQueue = DispatchQueue(label: "com.lefocus.albumart.disk", qos: .utility)
    private let pendingRequestsQueue = DispatchQueue(label: "com.lefocus.albumart.pending", qos: .utility)
    private let fileManager = FileManager.default
    private let diskDirectory: URL?

    private var pendingRequests: [String: [Completion]] = [:]

    private init() {
        memoryCache.countLimit = 20
        fetchQueue = OperationQueue()
        fetchQueue.qualityOfService = .utility
        fetchQueue.maxConcurrentOperationCount = 2
        diskDirectory = AlbumArtCoordinator.prepareDiskCacheDirectory(using: fileManager)
        diskQueue.async { [weak self] in
            self?.pruneDiskCache()
        }
    }

    func requestArtwork(for request: ArtworkRequest, completion: @escaping (ArtworkResult) -> Void) {
        let key = request.cacheKey

        if let cached = memoryCache.object(forKey: key as NSString) {
            DispatchQueue.main.async {
                completion(ArtworkResult(request: request, image: cached))
            }
            return
        }

        let completionWrapper: Completion = { image in
            DispatchQueue.main.async {
                completion(ArtworkResult(request: request, image: image))
            }
        }

        var shouldStartFetch = false
        pendingRequestsQueue.sync {
            if pendingRequests[key] != nil {
                pendingRequests[key]?.append(completionWrapper)
            } else {
                pendingRequests[key] = [completionWrapper]
                shouldStartFetch = true
            }
        }

        guard shouldStartFetch else { return }
        loadFromDiskOrFetch(request: request)
    }

    // MARK: - Private

    private func loadFromDiskOrFetch(request: ArtworkRequest) {
        let key = request.cacheKey
        guard let diskURL = cacheURL(for: key) else {
            startFetch(for: request)
            return
        }

        diskQueue.async { [weak self] in
            guard let self else { return }
            if let data = try? Data(contentsOf: diskURL),
               let image = NSImage(data: data) {
                self.memoryCache.setObject(image, forKey: key as NSString)
                self.finishRequest(forKey: key, image: image)
            } else {
                self.startFetch(for: request)
            }
        }
    }

    private func startFetch(for request: ArtworkRequest) {
        fetchQueue.addOperation { [weak self] in
            guard let self else { return }
            let key = request.cacheKey
            let fetched = self.performFetch(for: request)
            if let fetched {
                self.memoryCache.setObject(fetched, forKey: key as NSString)
                self.persistToDisk(image: fetched, key: key)
            }
            self.finishRequest(forKey: key, image: fetched)
        }
    }

    private func performFetch(for request: ArtworkRequest) -> NSImage? {
        let rawImage: NSImage?
        switch request.hint {
        case let .appleMusicBase64(base64):
            guard let data = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]) else {
                rawImage = nil
                break
            }
            rawImage = NSImage(data: data)
        }

        guard let rawImage else { return nil }
        return resized(image: rawImage, targetSize: CGSize(width: 96, height: 96))
    }

    private func resized(image: NSImage, targetSize: CGSize) -> NSImage? {
        let newImage = NSImage(size: targetSize)
        newImage.lockFocus()
        NSColor.clear.set()
        NSRect(origin: .zero, size: targetSize).fill()
        image.draw(
            in: NSRect(origin: .zero, size: targetSize),
            from: .zero,
            operation: .sourceOver,
            fraction: 1.0,
            respectFlipped: true,
            hints: [.interpolation: NSImageInterpolation.high]
        )
        newImage.unlockFocus()
        return newImage
    }

    private func persistToDisk(image: NSImage, key: String) {
        guard let url = cacheURL(for: key),
              let data = image.pngData() else { return }
        diskQueue.async { [weak self] in
            guard self != nil else { return }
            try? data.write(to: url, options: .atomic)
        }
    }

    private func finishRequest(forKey key: String, image: NSImage?) {
        let completions: [Completion]? = pendingRequestsQueue.sync {
            let handlers = pendingRequests[key]
            pendingRequests[key] = nil
            return handlers
        }
        completions?.forEach { $0(image) }
    }

    private func cacheURL(for key: String) -> URL? {
        guard let diskDirectory else { return nil }
        return diskDirectory.appendingPathComponent(key).appendingPathExtension("png")
    }

    private func pruneDiskCache() {
        guard let diskDirectory,
              let urls = try? fileManager.contentsOfDirectory(
                  at: diskDirectory,
                  includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey, .isRegularFileKey],
                  options: [.skipsHiddenFiles]
              ) else { return }

        let expiry = Date().addingTimeInterval(-Self.maxDiskAge)
        var retained: [(url: URL, date: Date, bytes: Int)] = []

        for url in urls {
            guard let values = try? url.resourceValues(
                forKeys: [.contentModificationDateKey, .fileSizeKey, .isRegularFileKey]
            ), values.isRegularFile == true else { continue }
            let date = values.contentModificationDate ?? .distantPast
            if date < expiry {
                try? fileManager.removeItem(at: url)
            } else {
                retained.append((url, date, values.fileSize ?? 0))
            }
        }

        var totalBytes = retained.reduce(0) { $0 + $1.bytes }
        for entry in retained.sorted(by: { $0.date < $1.date }) where totalBytes > Self.maxDiskBytes {
            do {
                try fileManager.removeItem(at: entry.url)
                totalBytes -= entry.bytes
            } catch {
                NSLog("AlbumArtCoordinator: Failed to evict cached artwork: %@", error.localizedDescription)
            }
        }
    }

    private static func prepareDiskCacheDirectory(using fileManager: FileManager) -> URL? {
        guard let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            return nil
        }
        let directory = caches.appendingPathComponent("com.lefocus.island-artwork", isDirectory: true)
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            return directory
        } catch {
            NSLog("AlbumArtCoordinator: Failed to create disk cache directory \(error)")
            return nil
        }
    }
}

private extension NSImage {
    func pngData() -> Data? {
        guard let cgImage = cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return nil
        }
        let rep = NSBitmapImageRep(cgImage: cgImage)
        rep.size = size
        return rep.representation(using: .png, properties: [:])
    }
}
