import Cocoa

extension IslandView {
    // MARK: - Timer Drawing

    func drawTimerText() {
        let timeString = formatTime(ms: displayMs)

        // Darker when not hovered, white when hovered
        let textColor: NSColor
        if isIdle {
            textColor = isHovered
                ? NSColor.white.withAlphaComponent(0.6)
                : NSColor.white.withAlphaComponent(0.3)
        } else {
            textColor = isHovered
                ? NSColor.white
                : NSColor.white.withAlphaComponent(0.4)
        }

        guard let timerFont = IslandView.monospacedFont(size: 14, weight: .semibold) else {
            return
        }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: timerFont,
            .foregroundColor: textColor
        ]

        let attributed = NSAttributedString(string: timeString, attributes: attributes)
        let textSize = attributed.size()
        // Right-align the text with some padding from the right edge
        let padding: CGFloat = 18.0
        let origin = NSPoint(
            x: bounds.maxX - textSize.width - padding,
            y: (bounds.height - textSize.height) / 2.0
        )
        attributed.draw(at: origin)
    }

    func drawTimerTextCompact() {
        guard !isIdle else { return }
        let timeString = formatTime(ms: displayMs)

        // Larger font for expanded view with timer
        guard let timerFont = IslandView.monospacedFont(size: 28, weight: .semibold) else {
            return
        }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: timerFont,
            .foregroundColor: NSColor.white.withAlphaComponent(0.9 * expandedContentOpacity)
        ]

        let attributed = NSAttributedString(string: timeString, attributes: attributes)
        let textSize = attributed.size()

        // Align timer top with title top
        // Title rect is at y: bounds.height - 56.0 with height 18.0
        // Title top is at: bounds.height - 56.0 + 18.0 = bounds.height - 38.0
        // To align timer top with title top: origin.y + textSize.height = bounds.height - 38.0
        let titleTop = bounds.height - 44.0
        let timerY = titleTop - textSize.height

        let originX: CGFloat
        if trackInfo == nil {
            originX = bounds.midX - textSize.width / 2.0
        } else {
            // Calculate the available space for timer on the right side to mirror audio section
            let rightSectionStartX = bounds.width * 0.5 + 22.0
            let rightSectionEndX = bounds.maxX - 22.0
            let availableWidth = rightSectionEndX - rightSectionStartX
            let centerX = rightSectionStartX + availableWidth / 2.0
            originX = centerX - textSize.width / 2.0
        }

        let origin = NSPoint(x: originX, y: timerY)
        attributed.draw(at: origin)
    }

    func drawTimerControlButtonsIfNeeded() {
        guard isExpanded, (!isIdle || hasTimerFinished) else {
            timerEndButton = ButtonArea()
            timerCancelButton = ButtonArea()
            return
        }

        layoutTimerControlButtonRects()

        if mode == .stopwatch {
            drawTextButton(timerEndButton, text: "End", emphasized: true)
            drawTextButton(timerCancelButton, text: "Cancel", emphasized: false)
            return
        }

        if hasTimerFinished {
            drawTextButton(timerEndButton, text: "End", emphasized: true)
        } else {
            drawTextButton(timerCancelButton, text: "Cancel", emphasized: false)
        }
    }

    func drawTextButton(_ button: ButtonArea, text: String, emphasized: Bool) {
        guard button.rect != .zero else { return }

        // Just draw text - no background or border
        let fontSize: CGFloat = 12.0
        let baseAlpha: CGFloat = emphasized ? 0.95 : 0.8
        let textColor = NSColor.white.withAlphaComponent(button.isHovered ? baseAlpha : baseAlpha * 0.7)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: fontSize, weight: emphasized ? .semibold : .regular),
            .foregroundColor: textColor
        ]
        let string = NSAttributedString(string: text, attributes: attributes)
        let origin = NSPoint(
            x: button.rect.midX - string.size().width / 2.0,
            y: button.rect.midY - string.size().height / 2.0
        )
        string.draw(at: origin)
    }

    func layoutTimerControlButtonRects() {
        guard isExpanded, (!isIdle || hasTimerFinished) else {
            timerEndButton = ButtonArea()
            timerCancelButton = ButtonArea()
            return
        }

        // Timer control buttons centered below the timer area
        // Align bottom edge with audio controls (which are at 10px from bottom)
        let buttonWidth: CGFloat = 64.0
        let buttonHeight: CGFloat = 26.0
        let spacing: CGFloat = 10.0
        let bottomY: CGFloat = 18.0

        // Determine the horizontal region the buttons should occupy
        let horizontalPadding: CGFloat = 20.0
        let usingFullWidth = trackInfo == nil
        let sectionStartX: CGFloat
        let sectionEndX: CGFloat
        if usingFullWidth {
            sectionStartX = horizontalPadding
            sectionEndX = bounds.maxX - horizontalPadding
        } else {
            sectionStartX = bounds.width * 0.5 + horizontalPadding
            sectionEndX = bounds.maxX - horizontalPadding
        }
        let centerX = (sectionStartX + sectionEndX) / 2.0

        // For stopwatch: show both End and Cancel, centered as a group
        // For countdown and break: show only Cancel, centered
        if mode == .stopwatch {
            // Total width of both buttons with spacing
            let totalWidth = buttonWidth * 2.0 + spacing
            let startX = centerX - totalWidth / 2.0

            timerEndButton.rect = NSRect(
                x: startX,
                y: bottomY,
                width: buttonWidth,
                height: buttonHeight
            )
            timerCancelButton.rect = NSRect(
                x: startX + buttonWidth + spacing,
                y: bottomY,
                width: buttonWidth,
                height: buttonHeight
            )
            return
        }

        if hasTimerFinished {
            timerEndButton.rect = NSRect(
                x: centerX - buttonWidth / 2.0,
                y: bottomY,
                width: buttonWidth,
                height: buttonHeight
            )
            timerCancelButton.rect = .zero
        } else {
            timerCancelButton.rect = NSRect(
                x: centerX - buttonWidth / 2.0,
                y: bottomY,
                width: buttonWidth,
                height: buttonHeight
            )
            timerEndButton.rect = .zero
        }
    }

    func drawTimerOnlyExpandedLayout() {
        if isIdle {
            return
        }
        drawTimerTextCompact()
    }

    func drawBreakLabel() {
        guard isExpanded, mode == .break, !isIdle else { return }
        
        let labelText = "Break"
        let labelFont = NSFont.systemFont(ofSize: 10, weight: .medium)
        
        // Very subtle - minimal visibility
        let baseAlpha: CGFloat = isHovered ? 0.3 : 0.25
        let textColor = NSColor.white.withAlphaComponent(baseAlpha * expandedContentOpacity)
        
        let attributes: [NSAttributedString.Key: Any] = [
            .font: labelFont,
            .foregroundColor: textColor
        ]
        
        let attributed = NSAttributedString(string: labelText, attributes: attributes)
        let textSize = attributed.size()
        
        // Position in top-right corner, aligned with waveform (which is at bounds.height - 20.0)
        // Waveform is centered vertically at baseY, so align break label center with waveform center
        let waveformBaseY: CGFloat = bounds.height - 20.0
        let waveformCenterY = waveformBaseY // Waveform bars are centered at baseY
        
        // Position break label in top-right, vertically aligned with waveform
        let padding: CGFloat = 16.0
        let breakLabelX = bounds.maxX - textSize.width - padding
        
        // Center the text vertically with the waveform
        // draw(at:) uses bottom-left origin, so we need to position it so the center aligns
        let breakLabelY = waveformCenterY - textSize.height / 2.0
        
        let origin = NSPoint(
            x: breakLabelX,
            y: breakLabelY
        )
        
        attributed.draw(at: origin)
    }
}
