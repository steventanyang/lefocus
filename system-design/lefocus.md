# LeFocus Context Companion -- Product Requirement Document

Version: Draft 0.2 -- 2025-10-17
Prepared for: Steven Yang (primary user)
Intended audience: self, future collaborators, open-source contributors
Document scope: product vision and experience requirements for the context-aware Pomodoro companion built for personal focus rituals.

---

## Table of Sections
1. Purpose and Background
2. Product Vision
3. Experience Principles
4. Target Audience and Personas
5. Core Problem Statements
6. Desired Outcomes
7. Product Scope for P0
8. Out-of-Scope Items
9. End-to-End Narrative
10. Session Timeline Summary Concept
11. Interface Themes and Tone
12. Interaction Requirements
13. Notification and Feedback Strategy
14. Performance and Responsiveness Expectations
15. Privacy and Trust Commitments
16. Accessibility and Inclusivity Considerations
17. Metrics and Success Signals
18. Risks and Assumptions
19. Rollout Milestones
20. Future Directions (Beyond P0)
21. Appendices

---

## 1. Purpose and Background
This document reframes the earlier system design into a product requirement document focused on experience outcomes rather than implementation details.
The intention is to articulate what the Pomodoro context companion should feel like, what problems it solves, and how success is perceived.
The document prioritizes clarity for personal use while remaining transparent for potential collaborators reviewing the open-source repository.

## 2. Product Vision
### Vision Statement
Create a personal Pomodoro companion that silently observes screen activity during focus sessions and reflects the story of attention afterward without demanding effort mid-session.

### North Star Experience
At the end of every session, Steven sees an elegant visual summary that validates how attention was spent, reinforces intentional focus, and invites gentle reflection.
The system remains invisible while the timer runs, surfacing insights only when it matters: the moment of post-session reflection.

## 3. Experience Principles
1. **Focus First:** Nothing should distract during a Pomodoro. All sensing happens silently with zero UI interruptions.
2. **Japanese Simplicity:** Visuals adopt restrained elegance--minimal palettes, horizontal bar graphs, and calm typography.
3. **Truthful Reflection:** Summaries should feel accurate enough to be trusted while acknowledging confidence levels.
4. **Personal Empowerment:** Insights belong to the user; the system serves as a mirror, not a judge.
5. **Instant Clarity:** Post-session breakdowns surface meaning in under a second and avoid cognitive overload.
6. **Ambient Delight:** Gentle animations or micro-interactions can exist but must never feel noisy or pushy.
7. **On-Device Integrity:** All sensing, classification, and summaries stay local and transparent to the user.

## 4. Target Audience and Personas
### Primary Persona: Steven
- Solo creator balancing product vision, coding, and writing tasks
- Values deep work, rituals, and aesthetics that invite calm
- Wants evidence of focus quality, not just quantity
- Prefers tools that feel handcrafted and respectful of privacy

### Secondary Persona: Curious Collaborator (Future)
- Potential contributor exploring the project via GitHub
- Needs clarity on desired experience to align contributions
- Shares respect for on-device autonomy and minimalist UX

## 5. Core Problem Statements
1. It is difficult to recall how attention drifted during a focus block when relying solely on memory.
2. Standard Pomodoro timers offer duration tracking but lack qualitative insight into application usage.
3. Manual time tracking interrupts flow and introduces friction that discourages consistent reflection.
4. Existing activity trackers either feel invasive, store data externally, or overwhelm with detail.

## 6. Desired Outcomes
- Provide post-session confidence about where attention was spent.
- Encourage gentle accountability without guilt or surveillance aesthetics.
- Support future planning by surfacing patterns across sessions (post-P0 trajectory).
- Maintain trust through transparent privacy messaging and open-source code.
- Keep the ritual delightful so the tool becomes a natural extension of daily focus routines.

## 7. Product Scope for P0
1. Pomodoro timer activation triggers background context sensing.
2. System samples active window metadata and screen snapshots at a defined cadence (no UX exposed).
3. Session end reveals a horizontal bar summary of time allocation across detected contexts.
4. A linear timeline scrubber lets the user skim through the session to see context shifts.
5. No manual tagging or editing in P0; the summary is informational only.
6. All processing remains on-device with zero raw image storage after sensing.
7. The entire experience prioritizes speed: capture and summary should feel instantaneous.

## 8. Out-of-Scope Items
1. Sharing summaries externally.
2. Automatic task tagging beyond basic app/window identification in P0.
3. Cloud sync or multi-user capabilities.
4. Manual journal prompts or reflection notes (may follow later).
5. Real-time overlays during the Pomodoro session itself.
6. Advanced analytics, streaks, or gamification metrics in the first release.

## 9. End-to-End Narrative
### Pre-Session Setup
- User grants necessary macOS permissions once (screen recording, accessibility) during onboarding.
- The app communicates privacy commitments clearly, emphasizing on-device processing and open-source transparency.
- User selects a Pomodoro preset but does not need to set an intent for P0.

### During Session
- Timer runs with ambient soundscapes (if enabled) while context sensing operates silently.
- No pop-ups, badges, or distracting UI while the timer counts down.
- System notes context transitions but defers all reporting until the session ends.

### Session Completion
- Upon timer completion, a summary view animates into place.
- The top of the summary shows a concise statement like "Your focus went to three contexts."
- A horizontal bar chart visualizes time percentages per context, ordered by magnitude.
- A timeline scrubber underneath allows hovering or dragging to see the context at specific moments.
- Confidence indicators accompany each context if certainty varies.
- User can dismiss the view or start the next session immediately.

## 10. Session Timeline Summary Concept
1. **Context Bands:** Each detected context displays as a segment within a stacked bar spanning the session duration.
2. **Time Percentages:** Percentage labels appear above or within each bar segment for quick scanning.
3. **Color Palette:** Use muted earth tones for contexts and a neutral background to uphold the calm aesthetic.
4. **Hover States:** Hovering over the timeline reveals timestamp and context label without clutter.
5. **Summary Caption:** Provide a single-line interpretation, e.g., "You spent most time in VS Code, with brief diversions to YouTube."
6. **Confidence Chips:** When the system is unsure, a small badge (e.g., "~") hints at lower confidence so users calibrate trust.
7. **Session Duration Marker:** Display the total session length prominently to contextualize percentages.

## 11. Interface Themes and Tone
1. Colors inspired by Japanese minimalism: warm neutrals, soft grays, a single accent hue.
2. Typography that feels handcrafted yet legible (e.g., humanist sans for primary text).
3. Motion language: gentle easing, no bouncy animations, everything purposeful.
4. Copywriting voice: calm, reflective, non-judgmental, personal.
5. Avoid dashboard aesthetics; aim for a crafted studio tool vibe.
6. Maintain consistency with existing Pomodoro timer screens for cohesion.

## 12. Interaction Requirements
1. Single tap or click to start the Pomodoro timer.
2. Immediate timer start with no intermediate modals in P0 once permissions are granted.
3. Auto-transition to summary view at session end; user can exit with one action.
4. Timeline scrubber responds fluidly to hover or drag without stutter.
5. Provide keyboard accessibility: arrow keys to move along the timeline, Escape to close summary.
6. Respect macOS windowing norms; summary view can coexist with other apps without forcing focus.

## 13. Notification and Feedback Strategy
1. Use native macOS notifications only if necessary to signal session completion (configurable).
2. During the session, avoid notifications about context switching to preserve focus.
3. Provide subtle haptic or sound cue at completion if available and desired.
4. Include microcopy assuring the user that data collection remained on-device.
5. Offer a dismissible tip the first time a summary is shown to explain the timeline visualization.

## 14. Performance and Responsiveness Expectations
1. Perceived latency for opening the summary should be under 200 milliseconds.
2. Timeline interactions should maintain 60fps on modern Mac hardware (M-series baseline).
3. Background sensing should not elevate CPU usage to the point of audible fan noise under typical workloads.
4. Battery impact should be equivalent to or lower than running a lightweight IDE during the same period.
5. The app must remain responsive when switching between spaces or displays.
6. Provide a fallback summary message if performance bottlenecks prevent detailed visualization.

## 15. Privacy and Trust Commitments
1. Clearly state on startup: "Everything stays on your Mac. No raw screenshots are stored."
2. Provide a settings toggle to pause sensing instantly at any moment.
3. Document data practices within the app and repository README for transparency.
4. Log only aggregated context labels for the session summary; discard intermediate data post-summary if not required.
5. Highlight open-source availability as a trust-building mechanism.
6. Respect sensitive applications; consider marking certain bundle IDs to auto-exclude in future iterations.

## 16. Accessibility and Inclusivity Considerations
1. Ensure summary visuals meet contrast ratios for readability.
2. Provide text alternatives for color-coded elements (labels, patterns).
3. Support VoiceOver reading order for summary components.
4. Avoid reliance on sound cues; provide visual equivalents.
5. Assume single-user language but avoid gendered pronouns in microcopy for inclusivity.
6. Keep interactions manageable with keyboard-only navigation.

## 17. Metrics and Success Signals
1. **Qualitative Delight:** Steven feels the summary accurately represents focus and continues to rely on it daily.
2. **Adoption:** Steven uses the companion for the majority of Pomodoro sessions over a two-week observation period.
3. **Trust:** No moments of doubt about privacy or data handling after initial onboarding.
4. **Accuracy Confidence:** Subjective rating of summary accuracy averages at least 4/5 during manual spot checks.
5. **Low Friction:** Average time from session completion to review is under five seconds.

## 18. Risks and Assumptions
### Key Risks
- Context detection may misclassify visually similar windows, reducing trust.
- Performance overhead could disrupt flow if sensing interferes with work.
- macOS permission complexity might create onboarding friction.

### Assumptions
- Steven is comfortable adjusting settings or calibrations post-P0 if needed.
- On-device resources (CPU/GPU) are sufficient for the envisioned cadence.
- No external integrations are required for the first release.

## 19. Rollout Milestones
1. Draft experience narrative and visual references.
2. Build baseline timer + silent sensing loop (no UI).
3. Create summary view prototype with sample data.
4. Conduct dogfooding sessions and collect manual notes on accuracy and delight.
5. Iterate on summary presentation and copy based on lived experience.
6. Prepare public README update explaining the feature once stable.

## 20. Future Directions (Beyond P0)
- Add manual tag editing and reflection journaling per session.
- Introduce pattern insights across days or weeks.
- Support multiple presets with tailored summaries (writing vs. coding vs. research).
- Explore lightweight ambient widgets that show focus streaks without details.
- Consider optional integrations with task lists while keeping data local.
- Provide API hooks for automation enthusiasts to build custom summaries.