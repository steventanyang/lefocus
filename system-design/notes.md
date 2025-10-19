1. keep just as timer for now, integration we can do in p1
2. I think we can use tokio tasks for the context sensing
3. I think we shoudl write swift code and expose via tauri plugin
4. Use existing creates we can make our own for p1
5. yea do the swift tuari plugin and call swift scripts
6. do sqlite
7. 
Duration: longer segments are usually more reliable.
Focus stability: fraction of frames where the same window/app stayed active.
Visual change clarity: how far the pHash/SSIM delta at boundaries is from your change threshold (the “margin”).
OCR quality: avg confidence or text length; 0 if OCR failed.

8. lets do memory and dump for now. we can make this more relaible p1

9. yea make the ui dead simple for now . just empty screen with timer clock + start stop buttons. replace audio ui entirely. keep teh audio files for later

10. use recharts,
11. no this is for p1

12. auto req on first start + minimal check
13. no fallback hard requirement
14. we can add telemetry later on for p1

15. if ocr graphics fail, right now just silent but log for me to see
16. yea just do the arc/box references handled by allocator
17. 

on switch(new_app):
  if current_segment.duration < min_segment:
    extend current to include brief switch (interruption noted)
  else if previous_app == new_app and last_interruption.duration <= merge_gap:
    merge sandwich; append "interruption: B (t)"
  else if switch_rate(60s) >= 3:
    open/extend "Transitioning" segment
  else:
    close current; open new segment

periodic:
  if "Transitioning" and stable in one app ≥ 15s: close Transitioning; open stable segment

  Thresholds
min_segment = 15s
merge_gap = 12s
transition_trigger: ≥3 switches in 60s OR median_dwell < 10s

