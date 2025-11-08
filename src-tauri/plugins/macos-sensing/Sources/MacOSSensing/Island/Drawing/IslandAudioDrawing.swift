import Cocoa

extension IslandView {
    // MARK: - Audio Drawing

    func drawAudioMetadataIfNeeded() {
        guard let track = trackInfo else { return }

        if !isExpanded {
            // Draw 4 thicker waveform pills instead of music note emoji
            drawCompactWaveform()
            return
        }

        // Apply fade-in opacity to expanded content
        let baseAlpha: CGFloat = isAudioPlaying ? 0.95 : 0.9

        // Left-aligned layout: title and artist stacked on left side
        let title = track.title.isEmpty ? "Unknown" : track.title
        let artist = track.artist.isEmpty ? "Unknown" : track.artist

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

        if isIdle {
            // No timer: center the audio content
            let maxContentWidth = bounds.width - 32.0  // Full width minus padding on both sides

            let titleRect = NSRect(
                x: 16.0,
                y: bounds.height - 56.0,
                width: maxContentWidth,
                height: 18.0
            )
            NSString(string: title).draw(with: titleRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: titleAttrs)

            let artistRect = NSRect(
                x: 16.0,
                y: bounds.height - 76.0,
                width: maxContentWidth,
                height: 16.0
            )
            NSString(string: artist).draw(with: artistRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: artistAttrs)
        } else {
            // Timer active: left-aligned layout, truncate at 50% of island width
            let maxTitleWidth = bounds.width * 0.5 - 16.0 // 50% minus left padding

            let titleRect = NSRect(
                x: 16.0,
                y: bounds.height - 56.0,
                width: maxTitleWidth,
                height: 18.0
            )
            NSString(string: title).draw(with: titleRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: titleAttrs)

            let artistRect = NSRect(
                x: 16.0,
                y: bounds.height - 76.0,
                width: maxTitleWidth,
                height: 16.0
            )
            NSString(string: artist).draw(with: artistRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: artistAttrs)
        }
    }

    func drawCompactWaveform() {
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
        let startX = 12.0 // Left side padding
        let centerY = bounds.midY

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
        let baseY: CGFloat = bounds.height - 20.0 // Near the top

        // Always position waveform at top-left
        let startX: CGFloat = 16.0

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

        let buttonSize = CGSize(width: 36.0, height: 36.0)
        let spacing: CGFloat = 12.0
        let bottomY: CGFloat = 14.0 // Aligned with timer control buttons

        // Position based on timer state
        let startX: CGFloat
        if isIdle {
            // No timer: center the playback buttons
            let totalButtonsWidth = buttonSize.width * 3.0 + spacing * 2.0
            startX = (bounds.width - totalButtonsWidth) / 2.0
        } else {
            // Timer active: left side, aligned with track info
            startX = 16.0
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
}
