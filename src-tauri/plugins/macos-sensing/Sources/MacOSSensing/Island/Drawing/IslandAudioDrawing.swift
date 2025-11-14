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
        drawArtworkImage(track.artwork, in: artworkRect, cornerRadius: 12.0, emphasize: true)

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

        let lineSpacing: CGFloat = 4.0
        let titleHeight = titleFont.ascender - titleFont.descender
        let artistHeight = artistFont.ascender - artistFont.descender
        let blockTop = bounds.height - 40.0

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

        let artistRect = NSRect(
            x: textStartX,
            y: blockTop - titleHeight - lineSpacing - artistHeight,
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
        let baseY: CGFloat = expandedArtworkRect().maxY + 8.0

        // Always position waveform just above text block (to the right of artwork)
        let startX: CGFloat = expandedArtworkRect().maxX + 12.0

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
                y: baseY - height / 2.0,
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
        let bottomY: CGFloat = bounds.height - 90.0

        // Position based on timer state
        let startX: CGFloat
        let buttonsWidth = buttonSize.width * 3.0 + spacing * 2.0
        let leftAlignment = expandedArtworkRect().minX
        if isIdle {
            // No timer: center the playback buttons
            startX = (bounds.width - buttonsWidth) / 2.0
        } else {
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
        return NSRect(x: 28.0, y: bounds.height - size - 28.0, width: size, height: size)
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
