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

        guard let timerFont = IslandView.monospacedFont(size: 13, weight: .medium) else {
            return
        }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: timerFont,
            .foregroundColor: textColor
        ]

        let attributed = NSAttributedString(string: timeString, attributes: attributes)
        let textSize = attributed.size()
        // Right-align the text with some padding from the right edge
        let padding: CGFloat = 12.0
        let origin = NSPoint(
            x: bounds.maxX - textSize.width - padding,
            y: (bounds.height - textSize.height) / 2.0
        )
        attributed.draw(at: origin)
    }

    func drawTimerTextCompact() {
        guard !isIdle else { return }
        let timeString = formatTime(ms: displayMs)

        // Smaller font for better fit (28pt instead of 36pt)
        guard let timerFont = IslandView.monospacedFont(size: 28, weight: .semibold) else {
            return
        }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: timerFont,
            .foregroundColor: NSColor.white.withAlphaComponent(0.9)
        ]

        let attributed = NSAttributedString(string: timeString, attributes: attributes)
        let textSize = attributed.size()

        // Calculate the available space for timer on the right side
        // Mirror the left section padding for symmetry:
        // Left section: 16px padding on left, ends at 50% - 16px
        // Right section: starts at 50% + 16px, 16px padding on right
        let rightSectionStartX = bounds.width * 0.5 + 16.0  // Start after center gap
        let rightSectionEndX = bounds.maxX - 16.0  // Right padding matches left padding
        let availableWidth = rightSectionEndX - rightSectionStartX

        // Center timer in the available right section
        let centerX = rightSectionStartX + availableWidth / 2.0

        // Align timer top with title top
        // Title rect is at y: bounds.height - 56.0 with height 18.0
        // Title top is at: bounds.height - 56.0 + 18.0 = bounds.height - 38.0
        // To align timer top with title top: origin.y + textSize.height = bounds.height - 38.0
        let titleTop = bounds.height - 38.0
        let timerY = titleTop - textSize.height

        let origin = NSPoint(
            x: centerX - textSize.width / 2.0,
            y: timerY
        )
        attributed.draw(at: origin)
    }

    func drawTimerControlButtonsIfNeeded() {
        guard isExpanded, !isIdle else {
            timerEndButton = ButtonArea()
            timerCancelButton = ButtonArea()
            return
        }

        layoutTimerControlButtonRects()

        if mode == .stopwatch {
            drawTextButton(timerEndButton, text: "End", emphasized: true)
        }
        drawTextButton(timerCancelButton, text: "Cancel", emphasized: false)
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
        guard isExpanded, !isIdle else {
            timerEndButton = ButtonArea()
            timerCancelButton = ButtonArea()
            return
        }

        // Timer control buttons centered below the timer in the right section
        let buttonWidth: CGFloat = 60.0
        let buttonHeight: CGFloat = 24.0
        let spacing: CGFloat = 8.0
        let bottomY: CGFloat = 20.0

        // Calculate right section center (same as timer positioning)
        // Mirror left section: starts at 50% + 16px, ends at right edge - 16px
        let rightSectionStartX = bounds.width * 0.5 + 16.0
        let rightSectionEndX = bounds.maxX - 16.0
        let centerX = (rightSectionStartX + rightSectionEndX) / 2.0

        // For stopwatch: show both End and Cancel, centered as a group
        // For countdown: show only Cancel, centered
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
        } else {
            // Countdown mode: only Cancel button, centered under timer
            timerCancelButton.rect = NSRect(
                x: centerX - buttonWidth / 2.0,
                y: bottomY,
                width: buttonWidth,
                height: buttonHeight
            )
            timerEndButton.rect = .zero
        }
    }
}
