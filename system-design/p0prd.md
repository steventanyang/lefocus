# 🧠 LeFocus Context Companion — P0 Product Requirement Document
**Version:** 0.1 (P0 Baseline)  
**Date:** October 2025  
**Prepared by:** Steven Yang  

---

## 1. Overview
The P0 milestone defines the **foundational, deterministic version** of the LeFocus Context Companion.  
It silently tracks where attention goes during a Pomodoro session using lightweight on-device sensing — no machine learning or semantic reasoning.  
Its purpose is to build trust, performance, and a smooth user experience before adding any local AI components in later phases (P1+).

---

## 2. Goal
Deliver a **zero-friction**, **on-device**, and **privacy-safe** Pomodoro companion that:
- Detects application and window-level context changes during a session.  
- Generates a **post-session timeline summary** showing how attention was distributed.  
- Consumes minimal system resources (<6% CPU, <300 MB RAM).  
- Operates entirely locally with **no internet dependency**.

---

## 3. Core User Story
> “When I finish a Pomodoro, I want to see a simple and truthful breakdown of how my focus was spent, without any setup or interruptions while I’m working.”

---

## 4. Success Criteria
| Metric | Target |
|---------|---------|
| **Avg CPU usage** | ≤ 6% (≤ 1 core sustained) |
| **Peak CPU spike** | ≤ 15% for < 1 s |
| **Memory footprint** | ≤ 300 MB steady |
| **Latency (summary render)** | ≤ 200 ms |
| **Privacy** | 0 network calls; no raw image storage |

---

## 5. Scope of Work (P0)
### 5.1 Core Capabilities
1. **Pomodoro integration:**  
   - When timer starts, background sensing activates.  
   - When timer ends, summary auto-generates.

2. **Context sensing pipeline:**  
   - Poll **active window metadata** (bundle ID, title, URL/path) every 5 s.  
   - Capture **low-res active-window screenshot** (≤ 1280 px width) only when change detected.  
   - Compute **perceptual hash (pHash)** + **SSIM** grid (4×4) to detect meaningful change.  
   - Run **Apple Vision OCR (fast mode)** every 15 s if new content type detected.  
   - Aggregate all readings into time-stamped “segments.”

3. **Session segmentation logic:**  
   - Create new segment when window or pHash/SSIM change exceeds threshold.  
   - Merge segments if same app/window recurs within short intervals (< 10 s).  
   - Each segment = `{start, end, bundleId, title, confidence}`.

4. **Summary generation:**  
   - Compute % time per unique context.  
   - Render **horizontal stacked bar** with context labels + confidence.  
   - Include total session length and short caption (“You spent most time in VS Code”).  
   - No editing or AI interpretation yet — purely factual.

5. **Privacy & lifecycle:**  
   - Images held in RAM only, discarded post-OCR.  
   - Session logs (titles, bundle IDs, durations) stored locally in JSON or SQLite.  
   - No cloud sync, telemetry, or hidden APIs.

---

## 6. Out of Scope (P0)
- Any use of CLIP/LLM embeddings or semantic labeling.  
- Task inference or Notion integration.  
- Live overlays or “real-time drift” nudges.  
- Multi-monitor or multi-user support.  
- Reflection journaling or gamification features.

---

## 7. Technical Requirements
| Category | Constraint / Choice |
|-----------|--------------------|
| **Language stack** | Rust (core + Tauri plugin), React (UI) |
| **OS target** | macOS 13+ (Apple Silicon) |
| **Data capture cadence** | 5 s base; 15 s idle |
| **Image pipeline** | Active-window only, grayscale downscale ≤ 1280 px |
| **Change detection** | pHash threshold ≥ 12; SSIM tile diff ≤ 0.75 |
| **OCR rate limit** | ≥ 15 s per window (Vision.framework, `.fast` mode) |
| **Storage** | Local JSON or SQLite (≤ 10 MB) |
| **Summary latency** | < 200 ms |
| **Threading model** | Single worker + async tasks via tokio |
| **Power impact** | < 1.5 W average on M1 MacBook Air |

---

## 8. User Flow
1. **Start Session:**  
   - User presses *Start Pomodoro* → timer + sensing loop begin.  
   - App requests screen-record + accessibility permissions once if needed.

2. **During Session:**  
   - Background process collects context deltas silently.  
   - No visible UI or notifications.

3. **Session End:**  
   - Timer completes → sensing loop halts.  
   - Context segments aggregated → summary view animates open.  
   - User sees stacked bar + caption + confidence markers.  
   - User dismisses summary or starts next timer.

---

## 9. Performance & Testing Plan
| Test | Acceptance |
|------|-------------|
| **Stress test** (90 min coding + browser switching) | < 6% avg CPU, < 300 MB RAM |
| **Accuracy check** | ≥ 90% of context switches correctly segmented |
| **Battery test** | < 3% additional drain/hour vs idle |
| **Privacy audit** | No persistent images or external calls detected |
| **Fail-safe** | If OCR/CoreGraphics fails → fallback to window title logging only |

---

## 10. Risks & Mitigations
| Risk | Mitigation |
|------|-------------|
| macOS permission friction | Build guided onboarding flow with friendly explainer. |
| OCR performance spikes | Limit frequency, reuse buffers, fast mode only. |
| Context mislabeling (false switches) | Use hysteresis: require 2 poll confirmations. |
| Summary feels inaccurate | Show confidence markers (~) transparently. |

---

## 13. Future (for P1+)
- Add **CLIP embeddings** for semantic context labeling.  
- Integrate **local LLM** for task inference and reflection summaries.  
- Expand to **multi-monitor** and **cross-day insights**.

---

### Summary
P0 delivers the “sensing spine” — fast, quiet, and trustworthy.  
If P0 feels effortless and invisible, P1 (semantic intelligence) will have a stable, efficient foundation to build on.