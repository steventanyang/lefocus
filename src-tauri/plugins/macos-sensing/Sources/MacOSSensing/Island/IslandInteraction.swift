import Cocoa

extension IslandView {
    // MARK: - Mouse Tracking
    
    func initializeTracking() {
        let options: NSTrackingArea.Options = [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect]
        let area = NSTrackingArea(rect: bounds, options: options, owner: self, userInfo: nil)
        addTrackingArea(area)
        trackingArea = area
    }
    
    // MARK: - Mouse Events
    
    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        interactionDelegate?.islandView(self, hoverChanged: true)
        interactionDelegate?.islandViewDidCancelCollapseRequest(self)
        needsDisplay = true
    }

    override func mouseExited(with event: NSEvent) {
        isHovered = false
        interactionDelegate?.islandView(self, hoverChanged: false)
        if isExpanded {
            interactionDelegate?.islandViewDidRequestCollapse(self, delay: 0.3)
        }
        needsDisplay = true
    }

    override func mouseMoved(with event: NSEvent) {
        guard isExpanded else { return }
        let point = convert(event.locationInWindow, from: nil)
        layoutPlaybackButtonRects()
        layoutTimerControlButtonRects()

        let wasHoveringPlay = playPauseButton.isHovered
        let wasHoveringPrev = previousButton.isHovered
        let wasHoveringNext = nextButton.isHovered
        let wasHoveringEnd = timerEndButton.isHovered
        let wasHoveringCancel = timerCancelButton.isHovered
        let wasHoveringProgress = progressBarArea.isHovered

        playPauseButton.isHovered = playPauseButton.rect.contains(point)
        previousButton.isHovered = previousButton.rect.contains(point)
        nextButton.isHovered = nextButton.rect.contains(point)
        timerEndButton.isHovered = timerEndButton.rect.contains(point)
        timerCancelButton.isHovered = timerCancelButton.rect.contains(point)
        let canSeek = progressBarArea.isInteractable
        progressBarArea.isHovered = canSeek && progressBarArea.barRect.contains(point)

        // Handle progress bar hover animation
        if wasHoveringProgress != progressBarArea.isHovered {
            if progressBarArea.isHovered {
                // Instant transition on hover enter
                progressBarArea.animatedHeight = 7.0
                progressBarArea.animatedOpacity = 1.0
                stopProgressBarAnimation()
            } else {
                // Smooth animation on hover exit
                startProgressBarHoverOutAnimation()
            }
        }

        if wasHoveringPlay != playPauseButton.isHovered ||
            wasHoveringPrev != previousButton.isHovered ||
            wasHoveringNext != nextButton.isHovered ||
            wasHoveringEnd != timerEndButton.isHovered ||
            wasHoveringCancel != timerCancelButton.isHovered ||
            wasHoveringProgress != progressBarArea.isHovered {
            needsDisplay = true
        }
    }

    override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)
        if isExpanded {
            layoutPlaybackButtonRects()
            layoutTimerControlButtonRects()

            if playPauseButton.rect.contains(location) {
                interactionDelegate?.islandViewDidRequestPlayPause(self)
                return
            }
            if previousButton.rect.contains(location) {
                interactionDelegate?.islandViewDidRequestPrevious(self)
                return
            }
            if nextButton.rect.contains(location) {
                interactionDelegate?.islandViewDidRequestNext(self)
                return
            }

            let extendedHitbox = progressBarArea.barRect.insetBy(dx: 0, dy: -8)
            if progressBarArea.isInteractable,
               progressBarArea.barRect.width > 0,
               extendedHitbox.contains(location),
               let track = trackInfo,
               let duration = track.duration,
               duration > 0 {
                let newPosition = seekPosition(for: location.x, duration: duration)
                progressBarArea.isDragging = true
                progressBarArea.pendingSeekTimestamp = nil
                progressBarArea.pendingSeekPosition = newPosition
                updateProgressBarOptimistically(to: newPosition)
                return
            }

            // Debounce timer control buttons to prevent double-click issues
            if timerEndButton.rect.contains(location) || timerCancelButton.rect.contains(location) {
                let now = Date().timeIntervalSince1970
                if let lastClick = lastTimerButtonClickTime,
                   now - lastClick < timerButtonDebounceInterval {
                    return  // Debounce: ignore rapid clicks
                }
                lastTimerButtonClickTime = now

                if timerEndButton.rect.contains(location) {
                    interactionDelegate?.islandViewDidRequestEndTimer(self)
                    return
                }
                if timerCancelButton.rect.contains(location) {
                    interactionDelegate?.islandViewDidRequestCancelTimer(self)
                    return
                }
            }
        }
        interactionDelegate?.islandViewDidRequestToggleExpansion(self)
    }

    override func mouseDragged(with event: NSEvent) {
        guard isExpanded,
              progressBarArea.isDragging,
              progressBarArea.barRect.width > 0,
              let duration = trackInfo?.duration,
              duration > 0 else {
            return
        }
        let location = convert(event.locationInWindow, from: nil)
        let newPosition = seekPosition(for: location.x, duration: duration)
        progressBarArea.pendingSeekPosition = newPosition
        progressBarArea.pendingSeekTimestamp = nil
        updateProgressBarOptimistically(to: newPosition)
    }

    override func mouseUp(with event: NSEvent) {
        if progressBarArea.isDragging {
            progressBarArea.isDragging = false
            if let position = progressBarArea.pendingSeekPosition {
                progressBarArea.pendingSeekTimestamp = Date()
                interactionDelegate?.islandView(self, didRequestSeek: position)
            }
            return
        }
        super.mouseUp(with: event)
    }
}

