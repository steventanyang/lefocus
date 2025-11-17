import Cocoa

extension IslandView {
    // MARK: - Fade Animation
    
    func startFadeInAnimation() {
        stopFadeAnimation()
        expandedContentOpacity = 0.0

        let duration: TimeInterval = 0.2 // 200ms fade-in
        let fps: Double = 60.0
        let frameDuration = 1.0 / fps
        let totalFrames = Int(duration / frameDuration)
        var currentFrame = 0

        fadeAnimationTimer = Timer.scheduledTimer(withTimeInterval: frameDuration, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }

            currentFrame += 1
            let progress = min(1.0, CGFloat(currentFrame) / CGFloat(totalFrames))

            // Ease-out animation for smoother feel
            self.expandedContentOpacity = self.easeOutQuad(progress)

            self.needsDisplay = true

            if currentFrame >= totalFrames {
                self.expandedContentOpacity = 1.0
                self.needsDisplay = true
                timer.invalidate()
                self.fadeAnimationTimer = nil
            }
        }
    }

    func stopFadeAnimation() {
        fadeAnimationTimer?.invalidate()
        fadeAnimationTimer = nil
    }

    func easeOutQuad(_ t: CGFloat) -> CGFloat {
        return t * (2.0 - t)
    }
    
    // MARK: - Progress Bar Animation
    
    func startProgressBarHoverOutAnimation() {
        stopProgressBarAnimation()
        
        let startHeight = progressBarArea.animatedHeight
        let startOpacity = progressBarArea.animatedOpacity
        let targetHeight: CGFloat = 6.0
        let targetOpacity: CGFloat = 0.5
        
        let duration: TimeInterval = 0.2 // 200ms animation
        let fps: Double = 60.0
        let frameDuration = 1.0 / fps
        let totalFrames = Int(duration / frameDuration)
        var currentFrame = 0
        
        progressBarAnimationTimer = Timer.scheduledTimer(withTimeInterval: frameDuration, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            
            currentFrame += 1
            let progress = min(1.0, CGFloat(currentFrame) / CGFloat(totalFrames))
            let easedProgress = self.easeOutQuad(progress)
            
            // Interpolate height and opacity
            self.progressBarArea.animatedHeight = startHeight + (targetHeight - startHeight) * easedProgress
            self.progressBarArea.animatedOpacity = startOpacity + (targetOpacity - startOpacity) * easedProgress
            
            self.needsDisplay = true
            
            if currentFrame >= totalFrames {
                self.progressBarArea.animatedHeight = targetHeight
                self.progressBarArea.animatedOpacity = targetOpacity
                self.needsDisplay = true
                timer.invalidate()
                self.progressBarAnimationTimer = nil
            }
        }
    }
    
    func stopProgressBarAnimation() {
        progressBarAnimationTimer?.invalidate()
        progressBarAnimationTimer = nil
    }
}

