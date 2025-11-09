import Cocoa

/// Manages a dedicated CGS space to keep island windows visible across Mission Control transitions.
final class IslandSpaceManager {
    static let shared = IslandSpaceManager()

    private var spaceIdentifier: CGSSpaceID?
    private let registeredWindows = NSHashTable<NSWindow>.weakObjects()

    private init() {}

    func attach(window: NSWindow?) {
        guard let window else { return }
        if Thread.isMainThread {
            attach(window: window, retriesRemaining: 5)
        } else {
            DispatchQueue.main.async { [weak self, weak window] in
                self?.attach(window: window)
            }
        }
    }

    func detach(window: NSWindow?) {
        guard let window else { return }
        assertMainThread()
        registeredWindows.remove(window)
        guard let space = spaceIdentifier,
              let windowID = windowID(for: window) else { return }
        removeWindows([windowID], from: space)
    }

    func teardown() {
        assertMainThread()
        guard let space = spaceIdentifier else { return }
        let windows = registeredWindows.allObjects.compactMap { windowID(for: $0) }
        if !windows.isEmpty {
            removeWindows(windows, from: space)
        }
        registeredWindows.removeAllObjects()
        logIfCGSError(
            CGSHideSpaces(_CGSDefaultConnection(), [NSNumber(value: space)] as CFArray),
            context: "CGSHideSpaces"
        )
        logIfCGSError(
            CGSSpaceDestroy(_CGSDefaultConnection(), space),
            context: "CGSSpaceDestroy"
        )
        spaceIdentifier = nil
    }

    // MARK: - CGS helpers

    private func ensureSpace() -> CGSSpaceID? {
        if let existing = spaceIdentifier {
            return existing
        }

        let connection = _CGSDefaultConnection()
        let space = CGSSpaceCreate(connection, 1, nil)
        guard space != 0 else {
            NSLog("IslandSpaceManager: failed to create CGS space")
            return nil
        }

        logIfCGSError(
            CGSSpaceSetAbsoluteLevel(connection, space, Int32.max),
            context: "CGSSpaceSetAbsoluteLevel"
        )
        logIfCGSError(
            CGSShowSpaces(connection, [NSNumber(value: space)] as CFArray),
            context: "CGSShowSpaces"
        )
        spaceIdentifier = space
        return space
    }

    private func addWindows(_ windowIDs: [CGSWindowID], to space: CGSSpaceID) {
        guard !windowIDs.isEmpty else { return }
        let connection = _CGSDefaultConnection()
        let cfWindows = windowIDs.map { NSNumber(value: $0) } as CFArray
        let cfSpaces = [NSNumber(value: space)] as CFArray
        logIfCGSError(
            CGSAddWindowsToSpaces(connection, cfWindows, cfSpaces),
            context: "CGSAddWindowsToSpaces"
        )
    }

    private func removeWindows(_ windowIDs: [CGSWindowID], from space: CGSSpaceID) {
        guard !windowIDs.isEmpty else { return }
        let connection = _CGSDefaultConnection()
        let cfWindows = windowIDs.map { NSNumber(value: $0) } as CFArray
        let cfSpaces = [NSNumber(value: space)] as CFArray
        logIfCGSError(
            CGSRemoveWindowsFromSpaces(connection, cfWindows, cfSpaces),
            context: "CGSRemoveWindowsFromSpaces"
        )
    }

    private func windowID(for window: NSWindow) -> CGSWindowID? {
        let number = window.windowNumber
        guard number != -1 else { return nil }
        return CGSWindowID(number)
    }

    private func assertMainThread() {
        assert(Thread.isMainThread, "IslandSpaceManager must be accessed on the main thread")
    }

    private func attach(window: NSWindow?, retriesRemaining: Int) {
        guard let window else { return }
        assertMainThread()

        if window.windowNumber == -1 {
            guard retriesRemaining > 0 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self, weak window] in
                self?.attach(window: window, retriesRemaining: retriesRemaining - 1)
            }
            return
        }

        registeredWindows.add(window)
        guard let space = ensureSpace(),
              let windowID = windowID(for: window) else { return }
        addWindows([windowID], to: space)
    }

    private func logIfCGSError(_ status: Int32, context: String) {
        if status == kCGErrorSuccess || status == kCGErrorAlreadyDone {
            return
        }
        NSLog("IslandSpaceManager: \(context) failed with status \(status)")
    }
}

// MARK: - CGS private declarations

private typealias CGSConnectionID = UInt32
private typealias CGSSpaceID = UInt64
private typealias CGSWindowID = UInt32
private let kCGErrorSuccess: Int32 = 0
private let kCGErrorAlreadyDone: Int32 = 1

@_silgen_name("_CGSDefaultConnection")
private func _CGSDefaultConnection() -> CGSConnectionID

@_silgen_name("CGSSpaceCreate")
private func CGSSpaceCreate(_ connection: CGSConnectionID, _ options: Int32, _ attributes: CFDictionary?) -> CGSSpaceID

@_silgen_name("CGSSpaceDestroy")
private func CGSSpaceDestroy(_ connection: CGSConnectionID, _ space: CGSSpaceID) -> Int32

@_silgen_name("CGSSpaceSetAbsoluteLevel")
private func CGSSpaceSetAbsoluteLevel(_ connection: CGSConnectionID, _ space: CGSSpaceID, _ level: Int32) -> Int32

@_silgen_name("CGSAddWindowsToSpaces")
private func CGSAddWindowsToSpaces(_ connection: CGSConnectionID, _ windows: CFArray, _ spaces: CFArray) -> Int32

@_silgen_name("CGSRemoveWindowsFromSpaces")
private func CGSRemoveWindowsFromSpaces(_ connection: CGSConnectionID, _ windows: CFArray, _ spaces: CFArray) -> Int32

@_silgen_name("CGSShowSpaces")
private func CGSShowSpaces(_ connection: CGSConnectionID, _ spaces: CFArray) -> Int32

@_silgen_name("CGSHideSpaces")
private func CGSHideSpaces(_ connection: CGSConnectionID, _ spaces: CFArray) -> Int32
