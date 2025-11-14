import Cocoa
import QuartzCore

protocol IslandWindowManagerDelegate: AnyObject {
    func islandWindowManagerDidCreateView(_ manager: IslandWindowManager, view: IslandView)
}

struct IslandWindowConfiguration {
    let compactSize: NSSize
    let expandedSize: NSSize
    let hoverDelta: NSSize
    let expandedVerticalOffset: CGFloat
}

/// Owns the NSPanel hierarchy and handles screen observation + sizing animations.
final class IslandWindowManager {
    weak var delegate: IslandWindowManagerDelegate?
    var interactionDelegate: IslandViewInteractionDelegate? {
        didSet {
            islandView?.interactionDelegate = interactionDelegate
        }
    }

    private let configuration: IslandWindowConfiguration
    private var parentWindow: NSPanel?
    private var islandWindow: NSPanel?
    private var screenObserver: NSObjectProtocol?
    private(set) var islandView: IslandView?

    private var isExpanded: Bool = false
    private var isHovering: Bool = false

    init(configuration: IslandWindowConfiguration) {
        self.configuration = configuration
    }

    func ensureWindowHierarchy() {
        guard let screen = NSScreen.lf_preferredIslandDisplay ?? NSScreen.main else {
            NSLog("IslandWindowManager: no available screen for island")
            return
        }

        // Hide island on Macs without a notch
        // TODO: check if this works
        guard screen.lf_notchRect != nil else {
            NSLog("IslandWindowManager: no notch detected, hiding island")
            islandWindow?.orderOut(nil)
            parentWindow?.orderOut(nil)
            return
        }

        if screenObserver == nil {
            screenObserver = NotificationCenter.default.addObserver(
                forName: NSApplication.didChangeScreenParametersNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.repositionForCurrentScreen()
            }
        }

        if parentWindow == nil {
            let panel = NSPanel(
                contentRect: screen.frame,
                styleMask: [.borderless, .nonactivatingPanel, .utilityWindow, .hudWindow],
                backing: .buffered,
                defer: false
            )
            panel.level = .mainMenu + 1
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = false
            panel.hidesOnDeactivate = false
            panel.ignoresMouseEvents = true
            panel.isMovable = false
            panel.isMovableByWindowBackground = false
            panel.isReleasedWhenClosed = false
            panel.collectionBehavior = [
                .canJoinAllSpaces,
                .stationary,
                .fullScreenAuxiliary,
                .ignoresCycle
            ]
            panel.contentView = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
            parentWindow = panel
        }

        if islandWindow == nil {
            let targetFrame = islandFrame(for: screen, size: currentIslandSize())
            let islandPanel = NSPanel(
                contentRect: targetFrame,
                styleMask: [.borderless, .nonactivatingPanel],
                backing: .buffered,
                defer: false
            )
            islandPanel.level = .mainMenu + 2
            islandPanel.isOpaque = false
            islandPanel.backgroundColor = .clear
            islandPanel.hasShadow = true
            islandPanel.hidesOnDeactivate = false
            islandPanel.ignoresMouseEvents = false
            islandPanel.isMovable = false
            islandPanel.isMovableByWindowBackground = false
            islandPanel.isReleasedWhenClosed = false
            islandPanel.acceptsMouseMovedEvents = true
            islandPanel.collectionBehavior = [
                .canJoinAllSpaces,
                .stationary,
                .fullScreenAuxiliary,
                .ignoresCycle
            ]

            let view = IslandView(frame: NSRect(origin: .zero, size: targetFrame.size))
            view.interactionDelegate = interactionDelegate
            islandPanel.contentView = view
            islandPanel.orderFrontRegardless()

            parentWindow?.addChildWindow(islandPanel, ordered: .above)

            islandWindow = islandPanel
            islandView = view
            delegate?.islandWindowManagerDidCreateView(self, view: view)
        }

        if let parentWindow {
            parentWindow.setFrame(screen.frame, display: true)
            parentWindow.orderFrontRegardless()
            IslandSpaceManager.shared.attach(window: parentWindow)
        }

        if let islandPanel = islandWindow {
            islandPanel.setFrame(islandFrame(for: screen, size: currentIslandSize()), display: true)
            islandPanel.orderFrontRegardless()
            IslandSpaceManager.shared.attach(window: islandPanel)
        }
    }

    func updateInteractionState(isExpanded: Bool, isHovering: Bool, animated: Bool) {
        self.isExpanded = isExpanded
        self.isHovering = isHovering
        updateIslandWindowSize(animated: animated, duration: isExpanded ? 0.25 : 0.15)
    }

    func repositionForCurrentScreen() {
        guard let panel = parentWindow else { return }
        guard let screen = panel.screen ?? NSScreen.lf_preferredIslandDisplay ?? NSScreen.main else {
            return
        }
        panel.setFrame(screen.frame, display: true)
        islandWindow?.setFrame(islandFrame(for: screen, size: currentIslandSize()), display: true)
        panel.orderFrontRegardless()
        islandWindow?.orderFrontRegardless()
    }

    func teardown() {
        if let observer = screenObserver {
            NotificationCenter.default.removeObserver(observer)
            screenObserver = nil
        }
        if let islandPanel = islandWindow {
            IslandSpaceManager.shared.detach(window: islandPanel)
            islandPanel.close()
        }
        if let parent = parentWindow {
            IslandSpaceManager.shared.detach(window: parent)
            parent.close()
        }
        islandWindow = nil
        parentWindow = nil
        islandView = nil
    }

    // MARK: - Private

    private func currentIslandSize() -> NSSize {
        if isExpanded {
            return configuration.expandedSize
        }
        if isHovering {
            return NSSize(
                width: configuration.compactSize.width + configuration.hoverDelta.width,
                height: configuration.compactSize.height + configuration.hoverDelta.height
            )
        }
        return configuration.compactSize
    }

    private func islandFrame(for screen: NSScreen, size: NSSize) -> NSRect {
        let originX = screen.frame.midX - size.width / 2.0

        if let notch = screen.lf_notchRect {
            // Calculate where the compact island's top edge would be
            let compactTopEdge = notch.maxY + islandVerticalInset(for: screen)

            // Keep the top edge aligned when expanding - only grow downward
            let originY = compactTopEdge - size.height

            return NSRect(x: originX, y: originY, width: size.width, height: size.height)
        }

        // For screens without notch, use similar logic
        let compactTopEdge = screen.frame.maxY - 8.0

        // Keep the top edge aligned when expanding - only grow downward
        let originY = compactTopEdge - size.height

        return NSRect(x: originX, y: originY, width: size.width, height: size.height)
    }

    private func islandVerticalInset(for screen: NSScreen) -> CGFloat {
        if #available(macOS 13.0, *), screen.safeAreaInsets.top > 0 {
            return 2.0
        }
        return 0.0
    }

    private func updateIslandWindowSize(animated: Bool, duration: TimeInterval) {
        guard let islandPanel = islandWindow else { return }
        guard let screen = islandPanel.screen ?? parentWindow?.screen ?? NSScreen.lf_preferredIslandDisplay ?? NSScreen.main else {
            return
        }
        let targetFrame = islandFrame(for: screen, size: currentIslandSize())
        if animated {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = duration
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                islandPanel.animator().setFrame(targetFrame, display: true)
            }
        } else {
            islandPanel.setFrame(targetFrame, display: true)
        }
    }
}
