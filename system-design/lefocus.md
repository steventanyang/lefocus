# 🍅 Pomodoro App — Base PRD

## 1. Context & Motivation

Modern productivity tools are either too minimal to be meaningful or too complex to feel human.  
The goal of this project is to build something personal — a native Mac Pomodoro app that feels alive, immersive, and reflective.

Most timer apps are just clocks.  
This one is meant to *change how focus feels*.

By combining soundscapes (rain, binaural beats, ambient tones) with a simple tagging system and local data storage, the app becomes a space for deeper focus and self-awareness rather than just time tracking.

This project started as an experiment in using **audio and flow** to reshape attention — exploring how technology can *support* the mind instead of constantly pulling it away.

---

## 2. Product Vision

> “Make focus feel rewarding.”

The app will help users enter flow states through sound, rhythm, and ritual.  
Each Pomodoro session becomes a small story — tagged, tracked, and reflected.

### Key themes:
- **Immersion:** Synthetic soundscapes that adapt to your focus.
- **Playfulness:** Light gamification (presets, streaks, session tags).
- **Self-awareness:** Reflection after sessions — not productivity metrics, but insight.
- **Local-first:** All data stays on your device. No logins, no cloud sync.

---

## 3. Goals

### Short-term (P0)
- Build a **Mac desktop app** using Tauri + React.
- Generate **focus sounds locally** (rain, white noise, binaural beats).
- Support **custom presets** (e.g., “Writing”, “Deep Work”, “Study”).
- Track completed Pomodoros locally with simple storage (JSON or SQLite).
- Provide a minimal, elegant UI with a focus timer and sound controls.

### Medium-term (P1)
- Add light gamification (streaks, XP, or mood tracking).
- Expand sound library (e.g., café, wind, forest, ocean).
- Provide insights: visualize patterns of focus or sound preferences.
- Optionally sync data across devices later (via backend or local export).

---

## 4. Why It Matters

Focus is becoming a lost art.  
This project explores how digital tools can *enhance presence* instead of fragmenting it.  
It’s an experiment in **human-computer interaction**, **sound design**, and **ritualized focus** — wrapped in a simple, local app.

This is less about productivity and more about **crafting attention**.

---

## 5. Success Criteria

- Users (even if just the creator) **enjoy opening it**.
- It feels *soothing*, *stable*, and *aesthetically satisfying*.
- You finish a session and feel **more grounded**, not drained.
- The app becomes a natural part of your day’s rhythm.

---

## 6. Non-Goals

- Competing with existing productivity SaaS tools.
- Cloud-based analytics or data aggregation.
- Heavy social or team-oriented features.
- Distraction-driven growth loops.

---

## 7. Next Steps

- [ ] Define initial sound generation layer (rain + binaural beats).
- [ ] Design the base UI: timer, sound controls, preset selector.
- [ ] Set up local persistence (JSON or SQLite).
- [ ] Ship a first working demo (focus → sound → reflection loop).

---

**Author:** Steven Yang  
**Date:** October 2025  
**Version:** v0.1 Draft