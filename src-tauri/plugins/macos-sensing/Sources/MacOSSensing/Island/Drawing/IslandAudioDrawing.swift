import Cocoa

public enum AudioArtworkLayout {
    static let expandedSize: CGFloat = 40.0
    static let compactSize: CGFloat = 18.0
}

extension IslandView {
    // MARK: - Audio Drawing

    func drawAudioMetadataIfNeeded() {
        guard let track = trackInfo else { return }

        if !isExpanded {
            // Compact layout handled elsewhere
            return
        }

        // Apply fade-in opacity to expanded content
        let baseAlpha: CGFloat = isAudioPlaying ? 0.95 : 0.9

        let artworkRect = expandedArtworkRect()
        drawArtworkImage(track.artwork, in: artworkRect, cornerRadius: 6.0, emphasize: true)

        // Left-aligned layout: title and artist stacked next to artwork
        let title = track.title.isEmpty ? "Unknown" : track.title
        let artist = track.artist.isEmpty ? "Unknown" : track.artist
        let textStartX = artworkRect.maxX + 12.0

        let titleFont = NSFont.systemFont(ofSize: 14, weight: .semibold)
        let titleAttrs: [NSAttributedString.Key: Any] = [
            .font: titleFont,
            .foregroundColor: NSColor.white.withAlphaComponent(baseAlpha * expandedContentOpacity)
        ]

        let artistFont = NSFont.systemFont(ofSize: 12, weight: .regular)
        let artistAttrs: [NSAttributedString.Key: Any] = [
            .font: artistFont,
            .foregroundColor: NSColor.white.withAlphaComponent(0.7 * expandedContentOpacity)
        ]

        let maxContentWidth: CGFloat
        if isIdle {
            maxContentWidth = bounds.width - textStartX - 24.0
        } else {
            maxContentWidth = max(120.0, bounds.width * 0.5 - textStartX)
        }

        let lineSpacing: CGFloat = 2.0
        let titleHeight = titleFont.ascender - titleFont.descender
        let artistHeight = artistFont.ascender - artistFont.descender
        // Position metadata block lower to avoid notch (around 50px from top)
        let blockTop = bounds.height - 50.0

        let titleRect = NSRect(
            x: textStartX,
            y: blockTop - titleHeight,
            width: maxContentWidth,
            height: titleHeight
        )
        NSString(string: title).draw(
            with: titleRect,
            options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
            attributes: titleAttrs
        )

        // Artist positioning: always use consistent spacing below title
        let artistY = blockTop - titleHeight - lineSpacing - artistHeight
        let artistRect = NSRect(
            x: textStartX,
            y: artistY,
            width: maxContentWidth,
            height: artistHeight
        )
        NSString(string: artist).draw(
            with: artistRect,
            options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
            attributes: artistAttrs
        )
    }

    func drawProgressBarIfNeeded() {
        guard isExpanded,
              isIdle,
              let track = trackInfo,
              let position = track.position,
              let duration = track.duration,
              duration > 0 else {
            progressBarArea = ProgressBarArea()
            return
        }

        let barY: CGFloat = 65.0
        let horizontalMargin: CGFloat = 28.0  // Consistent margin on both sides

        let currentTimeStr = formatPlaybackTime(position)
        let durationStr = formatPlaybackTime(duration)
        let timeFont = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular)
        let timeAttrs: [NSAttributedString.Key: Any] = [
            .font: timeFont,
            .foregroundColor: NSColor.white.withAlphaComponent(0.7 * expandedContentOpacity)
        ]

        let currentSize = NSString(string: currentTimeStr).size(withAttributes: timeAttrs)
        let durationSize = NSString(string: durationStr).size(withAttributes: timeAttrs)

        let currentRect = NSRect(
            x: horizontalMargin,
            y: barY - currentSize.height / 2.0,
            width: currentSize.width,
            height: currentSize.height
        )
        NSString(string: currentTimeStr).draw(in: currentRect, withAttributes: timeAttrs)

        let durationX = bounds.width - horizontalMargin - durationSize.width
        let durationRect = NSRect(
            x: durationX,
            y: barY - durationSize.height / 2.0,
            width: durationSize.width,
            height: durationSize.height
        )
        NSString(string: durationStr).draw(in: durationRect, withAttributes: timeAttrs)

        let barStartX = currentRect.maxX + 12.0
        let barEndX = durationRect.minX - 12.0
        let barWidth = barEndX - barStartX
        guard barWidth > 0 else {
            progressBarArea = ProgressBarArea()
            return
        }

        // Initialize animated values if needed (first draw or reset)
        // Default values are set in ProgressBarArea struct (6.0 height, 0.5 opacity)

        // Use animated height and opacity for Apple-style progress bar
        let barHeight = progressBarArea.animatedHeight
        // Use hovered height (8px) for hitbox to improve interaction
        let hitboxHeight: CGFloat = 8.0
        let barRect = NSRect(
            x: barStartX,
            y: barY - barHeight / 2.0,
            width: barWidth,
            height: barHeight
        )
        // Hitbox uses larger height for better click target
        let hitboxRect = NSRect(
            x: barStartX,
            y: barY - hitboxHeight / 2.0,
            width: barWidth,
            height: hitboxHeight
        )
        progressBarArea.barRect = hitboxRect
        progressBarArea.isInteractable = track.canSeek
        if !track.canSeek {
            progressBarArea.isDragging = false
            progressBarArea.pendingSeekPosition = nil
        }
        if !track.canSeek {
            progressBarArea.isHovered = false
        }

        // Draw background track (unfilled portion)
        let backgroundPath = NSBezierPath(roundedRect: barRect, xRadius: barHeight / 2.0, yRadius: barHeight / 2.0)
        let backgroundAlpha: CGFloat = track.canSeek ? 0.2 : 0.1
        NSColor.white.withAlphaComponent(backgroundAlpha * expandedContentOpacity).setFill()
        backgroundPath.fill()

        let renderPosition: TimeInterval
        if let pending = progressBarArea.pendingSeekPosition,
           (progressBarArea.isDragging || progressBarArea.pendingSeekTimestamp != nil) {
            renderPosition = pending
        } else {
            renderPosition = position
        }

        // Draw progress fill with animated opacity
        let rawProgress = CGFloat(renderPosition / duration)
        let clampedProgress = min(max(rawProgress, 0), 1)
        let fillRect = NSRect(
            x: barStartX,
            y: barY - barHeight / 2.0,
            width: barWidth * clampedProgress,
            height: barHeight
        )
        let fillPath = NSBezierPath(roundedRect: fillRect, xRadius: barHeight / 2.0, yRadius: barHeight / 2.0)
        // Use animated opacity: 0.5 normal, 1.0 hovered
        let fillOpacity = track.canSeek ? progressBarArea.animatedOpacity : 0.35
        NSColor.white.withAlphaComponent(fillOpacity * expandedContentOpacity).setFill()
        fillPath.fill()
    }

    func drawCompactWaveform(startX customStartX: CGFloat? = nil, centerY customCenterY: CGFloat? = nil) {
        guard !waveformBars.isEmpty, waveformBars.count == 4 else { return }

        // Match the width of the music note emoji (size 11 font)
        let emojiString = NSAttributedString(string: "🎵", attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .regular)
        ])
        let emojiWidth = emojiString.size().width
        let totalWidth = emojiWidth
        let baseSpacing: CGFloat = 3.0
        let widthScale: CGFloat = 1.2
        let heightScale: CGFloat = 1.3
        let spacing = baseSpacing * widthScale
        let basePillWidth = (totalWidth - baseSpacing * 3.0) / 4.0
        let pillWidth = basePillWidth * widthScale
        let pillHeight: CGFloat = 12.0 * heightScale
        // Add padding to account for notch top corner curve (10px radius)
        let startX = customStartX ?? 22.0
        let centerY = customCenterY ?? notchCenterY

        let hasPalette = waveformGradient != nil
        let isLiveWaveform = hasPalette && isAudioPlaying
        let deadDotHeight = pillWidth * 1.12
        for (index, value) in waveformBars.enumerated() {
            let height: CGFloat
            if isLiveWaveform {
                // Animate when playing only after palette is ready
                let normalized = min(1.0, value)
                height = normalized * pillHeight
            } else {
                // Flat dots before palette loads or when paused
                height = deadDotHeight
            }

            let rect = NSRect(
                x: startX + CGFloat(index) * (pillWidth + spacing),
                y: centerY - height / 2.0,
                width: pillWidth,
                height: height
            )
            let path = NSBezierPath(roundedRect: rect, xRadius: pillWidth / 2.0, yRadius: pillWidth / 2.0)
            let alpha: CGFloat = isAudioPlaying ? 0.8 : 0.5
            let color = isLiveWaveform
                ? waveformColor(forBar: index, totalBars: waveformBars.count, baseAlpha: alpha)
                : deadWaveformDotColor(baseAlpha: alpha)
            color.setFill()
            path.fill()
        }
    }

    func drawWaveformIfNeeded() {
        guard isExpanded, trackInfo != nil, !waveformBars.isEmpty, waveformBars.count == 4 else { return }

        // Waveform positioning
        let emojiString = NSAttributedString(string: "🎵", attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .regular)
        ])
        let emojiWidth = emojiString.size().width
        let totalWidth = emojiWidth
        let baseSpacing: CGFloat = 3.0
        let widthScale: CGFloat = 1.2
        let heightScale: CGFloat = 1.3
        let spacing = baseSpacing * widthScale
        let basePillWidth = (totalWidth - baseSpacing * 3.0) / 4.0
        let pillWidth = basePillWidth * widthScale
        let pillHeight: CGFloat = 12.0 * heightScale
        
        // Position waveform at top left (around 28px from top) - stays fixed regardless of title/artist position
        let waveformCenterY = bounds.height - 28.0
        // Position waveform left edge - add padding to account for notch top corner curve (10px radius)
        let startX: CGFloat = 38.0

        let hasPalette = waveformGradient != nil
        let isLiveWaveform = hasPalette && isAudioPlaying
        let deadDotHeight = pillWidth * 1.12
        for (index, value) in waveformBars.enumerated() {
            let height: CGFloat
            if isLiveWaveform {
                // Animate when playing only after palette is ready
                let normalized = min(1.0, value)
                height = normalized * pillHeight
            } else {
                // Flat dots before palette loads or when paused
                height = deadDotHeight
            }

            let rect = NSRect(
                x: startX + CGFloat(index) * (pillWidth + spacing),
                y: waveformCenterY - height / 2.0,
                width: pillWidth,
                height: height
            )
            let path = NSBezierPath(roundedRect: rect, xRadius: pillWidth / 2.0, yRadius: pillWidth / 2.0)
            // Opacity varies based on timer state and playback state
            let baseAlpha: CGFloat
            if isIdle {
                baseAlpha = isAudioPlaying ? 0.9 : 0.6
            } else {
                baseAlpha = isAudioPlaying ? 0.7 : 0.35
            }
            let alpha = baseAlpha * expandedContentOpacity
            let color = isLiveWaveform
                ? waveformColor(forBar: index, totalBars: waveformBars.count, baseAlpha: alpha)
                : deadWaveformDotColor(baseAlpha: alpha)
            color.setFill()
            path.fill()
        }
    }

    func drawPlaybackButtonsIfNeeded() {
        guard isExpanded, trackInfo != nil else {
            resetButtonAreas()
            return
        }

        layoutPlaybackButtonRects()

        drawButton(previousButton, symbolName: "backward.fill", filled: previousButton.isHovered)
        let playSymbol = isAudioPlaying ? "pause.fill" : "play.fill"
        drawButton(playPauseButton, symbolName: playSymbol, filled: playPauseButton.isHovered, emphasized: true)
        drawButton(nextButton, symbolName: "forward.fill", filled: nextButton.isHovered)
    }

    func drawButton(_ button: ButtonArea, symbolName: String, filled: Bool, emphasized: Bool = false) {
        guard button.rect != .zero else { return }

        // No circle background, just SF Symbol icon
        // Scale icon larger when hovered
        let basePointSize: CGFloat = emphasized ? 22.0 : 16.0
        let pointSize = button.isHovered ? basePointSize * 1.2 : basePointSize

        // Use SF Symbols with weight and size configuration
        let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .semibold)
        guard let image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)?
            .withSymbolConfiguration(config) else {
            return
        }

        // Tint the image white
        let tintedImage = image.copy() as! NSImage
        tintedImage.lockFocus()
        NSColor.white.set()
        let imageRect = NSRect(origin: .zero, size: tintedImage.size)
        imageRect.fill(using: .sourceAtop)
        tintedImage.unlockFocus()

        // Center the image in the button rect and apply fade-in opacity
        let imageSize = tintedImage.size
        let origin = NSPoint(
            x: button.rect.midX - imageSize.width / 2.0,
            y: button.rect.midY - imageSize.height / 2.0
        )
        tintedImage.draw(at: origin, from: .zero, operation: .sourceOver, fraction: expandedContentOpacity)
    }

    func layoutPlaybackButtonRects() {
        guard isExpanded, trackInfo != nil else {
            resetButtonAreas()
            return
        }

        let buttonSize = CGSize(width: 42.0, height: 42.0)
        let spacing: CGFloat = 12.0
        
        // Position based on timer state
        let bottomY: CGFloat
        let startX: CGFloat
        let buttonsWidth = buttonSize.width * 3.0 + spacing * 2.0
        let leftAlignment = expandedArtworkRect().minX
        if isIdle {
            // No timer: center the playback buttons horizontally, position them lower
            bottomY = 10.0
            startX = (bounds.width - buttonsWidth) / 2.0
        } else {
            // Timer running: align playback buttons under metadata, lower in the view
            bottomY = 10.0
            startX = leftAlignment
        }

        previousButton.rect = NSRect(
            x: startX,
            y: bottomY,
            width: buttonSize.width,
            height: buttonSize.height
        )
        playPauseButton.rect = NSRect(
            x: startX + buttonSize.width + spacing,
            y: bottomY,
            width: buttonSize.width,
            height: buttonSize.height
        )
        nextButton.rect = NSRect(
            x: startX + (buttonSize.width + spacing) * 2.0,
            y: bottomY,
            width: buttonSize.width,
            height: buttonSize.height
        )
    }

    // MARK: - Artwork helpers

    private func expandedArtworkRect() -> NSRect {
        let size = AudioArtworkLayout.expandedSize
        // Align artwork center with title/artist block center (which is at blockTop = bounds.height - 50.0)
        let blockTop = bounds.height - 50.0
        let titleFont = NSFont.systemFont(ofSize: 14, weight: .semibold)
        let titleHeight = titleFont.ascender - titleFont.descender
        let artistFont = NSFont.systemFont(ofSize: 12, weight: .regular)
        _ = artistFont.ascender - artistFont.descender
        let lineSpacing: CGFloat = 2.0
        // Calculate gap between title and artist
        // Title bottom is at blockTop - titleHeight
        // Artist top is at blockTop - titleHeight - lineSpacing
        // Gap center is halfway between them
        let titleBottom = blockTop - titleHeight
        let artistTop = titleBottom - lineSpacing
        let gapCenter = (titleBottom + artistTop) / 2.0
        // Center artwork vertically with the gap between title and artist
        let artworkCenterY = gapCenter
        let yPosition = artworkCenterY - size / 2.0
        // Add padding to account for notch top corner curve (10px radius)
        let xPosition: CGFloat = 38.0
        return NSRect(x: xPosition, y: yPosition, width: size, height: size)
    }

    func drawArtworkImage(_ image: NSImage?, in rect: NSRect, cornerRadius: CGFloat, emphasize: Bool) {
        let path = NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius)
        NSGraphicsContext.saveGraphicsState()
        path.addClip()

        let hasImage = image != nil

        if let image {
            let opacity = emphasize ? expandedContentOpacity : 1.0
            image.draw(
                in: rect,
                from: .zero,
                operation: .sourceOver,
                fraction: opacity,
                respectFlipped: true,
                hints: [.interpolation: NSImageInterpolation.high]
            )
        } else {
            drawArtworkPlaceholder(in: rect, emphasize: emphasize)
        }

        NSGraphicsContext.restoreGraphicsState()
        if hasImage {
            let strokeAlpha: CGFloat = emphasize ? 0.18 : 0.12
            NSColor.white.withAlphaComponent(strokeAlpha).setStroke()
            path.lineWidth = emphasize ? 1.0 : 0.5
            path.stroke()
        }
    }

    func drawArtworkPlaceholder(in rect: NSRect, emphasize: Bool) {
        let baseAlpha: CGFloat = emphasize ? 0.85 : 0.75
        let fillColor = NSColor(calibratedWhite: 0.03, alpha: baseAlpha)
        fillColor.setFill()
        rect.fill()
    }

    fileprivate func waveformColor(forBar index: Int, totalBars: Int, baseAlpha: CGFloat) -> NSColor {
        let fallback = NSColor.white.withAlphaComponent(baseAlpha)
        guard let gradient = waveformGradient else {
            return fallback
        }

        let barCount = max(totalBars, 1)
        let location: CGFloat
        if barCount == 1 {
            location = 0.5
        } else {
            location = CGFloat(index) / CGFloat(barCount - 1)
        }

        let clampedLocation = min(max(location, 0.0), 1.0)
        let color = gradient.interpolatedColor(atLocation: clampedLocation)
        return color.withAlphaComponent(baseAlpha)
    }

    private func deadWaveformDotColor(baseAlpha: CGFloat) -> NSColor {
        NSColor(calibratedWhite: 0.75, alpha: baseAlpha)
    }

    private func formatPlaybackTime(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite else { return "0:00" }
        let totalSeconds = max(0, Int(seconds.rounded(.down)))
        let minutes = totalSeconds / 60
        let remaining = totalSeconds % 60
        return String(format: "%d:%02d", minutes, remaining)
    }
    
    // MARK: - Progress Bar Interaction
    
    func updateProgressBarOptimistically(to position: TimeInterval) {
        guard let track = trackInfo, track.canSeek else { return }
        progressBarArea.pendingSeekPosition = position
        if !progressBarArea.isDragging {
            progressBarArea.pendingSeekTimestamp = Date()
        }
        trackInfo = track.updatingPlayback(position: position)
        needsDisplay = true
    }

    func seekPosition(for x: CGFloat, duration: TimeInterval) -> TimeInterval {
        let clampedX = min(max(x, progressBarArea.barRect.minX), progressBarArea.barRect.maxX)
        let relative = (clampedX - progressBarArea.barRect.minX) / progressBarArea.barRect.width
        let progress = min(max(Double(relative), 0.0), 1.0)
        return progress * duration
    }

    func applyPendingSeekIfNeeded(to track: TrackInfo?) -> TrackInfo? {
        guard let track else {
            progressBarArea.pendingSeekPosition = nil
            progressBarArea.pendingSeekTimestamp = nil
            return nil
        }
        guard track.canSeek else {
            progressBarArea.pendingSeekPosition = nil
            progressBarArea.pendingSeekTimestamp = nil
            return track
        }

        guard let pending = progressBarArea.pendingSeekPosition else {
            return track
        }

        if let actual = track.position,
           !progressBarArea.isDragging {
            let delta = abs(actual - pending)
            let matched = delta < 0.25
            let expired = progressBarArea.pendingSeekTimestamp.map { Date().timeIntervalSince($0) > 1.5 } ?? false
            if matched || expired {
                progressBarArea.pendingSeekPosition = nil
                progressBarArea.pendingSeekTimestamp = nil
                return track
            }
        }

        return track.updatingPlayback(position: pending)
    }
    
    // MARK: - Compact Layout Drawing
    
    private enum CompactLayoutState {
        case audioOnly
        case timerActive
        case idle
    }

    private var compactLayoutState: CompactLayoutState {
        if isIdle {
            return trackInfo == nil ? .idle : .audioOnly
        }
        return .timerActive
    }

    func drawCompactLayout() {
        switch compactLayoutState {
        case .audioOnly:
            drawCompactArtworkOnLeft()
            drawCompactWaveformOnRight()
        case .timerActive:
            drawTimerText()
            if trackInfo != nil {
                let waveformStartX = compactDotsZoneWidth > 0 ? compactDotsZoneWidth : 26.0
                drawCompactWaveform(startX: waveformStartX, centerY: notchCenterY)
            }
        case .idle:
            let waveformStartX = compactDotsZoneWidth > 0 ? compactDotsZoneWidth : 26.0
            drawCompactWaveform(startX: waveformStartX, centerY: notchCenterY)
        }
    }

    func drawCompactArtworkOnLeft() {
        guard let track = trackInfo else { return }
        let size = AudioArtworkLayout.compactSize
        let artX = compactDotsZoneWidth > 0 ? compactDotsZoneWidth : 22.0
        let rect = NSRect(
            x: artX,
            y: notchCenterY - size / 2.0,
            width: size,
            height: size
        )
        drawArtworkImage(track.artwork, in: rect, cornerRadius: 3.0, emphasize: false)
    }

    private func drawCompactWaveformOnRight() {
        guard !waveformBars.isEmpty, waveformBars.count == 4 else { return }
        // Calculate total waveform width to right-align it
        let emojiString = NSAttributedString(string: "🎵", attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .regular)
        ])
        let emojiWidth = emojiString.size().width
        let baseSpacing: CGFloat = 3.0
        let widthScale: CGFloat = 1.2
        let spacing = baseSpacing * widthScale
        let basePillWidth = (emojiWidth - baseSpacing * 3.0) / 4.0
        let pillWidth = basePillWidth * widthScale
        let totalWaveformWidth = 4.0 * pillWidth + 3.0 * spacing
        let startX = bounds.maxX - totalWaveformWidth - 22.0
        drawCompactWaveform(startX: startX, centerY: notchCenterY)
    }
}
