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

    func drawCompactWaveform(startX customStartX: CGFloat? = nil, centerY customCenterY: CGFloat? = nil) {
        guard !waveformBars.isEmpty, waveformBars.count == 4 else { return }

        // Match the width of the music note emoji (size 11 font)
        let emojiString = NSAttributedString(string: "🎵", attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .regular)
        ])
        let emojiWidth = emojiString.size().width
        let totalWidth = emojiWidth
        let spacing: CGFloat = 3.0
        let pillWidth = (totalWidth - spacing * 3.0) / 4.0
        let pillHeight: CGFloat = 12.0
        let startX = customStartX ?? 12.0
        let centerY = customCenterY ?? bounds.midY

        for (index, value) in waveformBars.enumerated() {
            let height: CGFloat
            if isAudioPlaying {
                // Animate when playing: use actual waveform values
                let normalized = min(1.0, value)
                height = normalized * pillHeight
            } else {
                // Flat dots when paused: minimum height (just the pill width for circular dots)
                height = pillWidth
            }

            let rect = NSRect(
                x: startX + CGFloat(index) * (pillWidth + spacing),
                y: centerY - height / 2.0,
                width: pillWidth,
                height: height
            )
            let path = NSBezierPath(roundedRect: rect, xRadius: pillWidth / 2.0, yRadius: pillWidth / 2.0)
            let alpha: CGFloat = isAudioPlaying ? 0.8 : 0.5
            NSColor.white.withAlphaComponent(alpha).setFill()
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
        let spacing: CGFloat = 3.0
        let pillWidth = (totalWidth - spacing * 3.0) / 4.0
        let pillHeight: CGFloat = 12.0
        
        // Position waveform at top left (around 28px from top) - stays fixed regardless of title/artist position
        let waveformCenterY = bounds.height - 28.0
        // Position waveform left edge aligned with album cover left edge (28px from left)
        let startX: CGFloat = 28.0

        for (index, value) in waveformBars.enumerated() {
            let height: CGFloat
            if isAudioPlaying {
                // Animate when playing: use actual waveform values
                let normalized = min(1.0, value)
                height = normalized * pillHeight
            } else {
                // Flat dots when paused: minimum height (just the pill width for circular dots)
                height = pillWidth
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
            NSColor.white.withAlphaComponent(baseAlpha * expandedContentOpacity).setFill()
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
        let basePointSize: CGFloat = emphasized ? 18.0 : 16.0
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
        guard isExpanded else {
            resetButtonAreas()
            return
        }

        let buttonSize = CGSize(width: 42.0, height: 42.0)
        let spacing: CGFloat = 18.0
        
        // Position based on timer state
        let bottomY: CGFloat
        let startX: CGFloat
        let buttonsWidth = buttonSize.width * 3.0 + spacing * 2.0
        let leftAlignment = expandedArtworkRect().minX
        if isIdle {
            // No timer: center the playback buttons horizontally, position them lower
            // Place them in the lower portion of the expanded view (around 10px from bottom)
            bottomY = 10.0
            startX = (bounds.width - buttonsWidth) / 2.0
        } else {
            // Timer running: align playback buttons under metadata, lower in the view
            // Position them around 10px from bottom to match idle state
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
        let artistHeight = artistFont.ascender - artistFont.descender
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
        let xPosition: CGFloat = 28.0
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
}
