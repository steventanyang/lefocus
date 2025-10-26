1. 
- lets do timer state in rust so its 1 source of truth
- keep flow simple (no pause/resume in P0)
- if crashes, for now we're just going to end on quit. later on in p1 we can do soft resume

2. 
- use tauri app data directory
- initialize on app startup
- yea lets set up migrations now , use PRAGMA

3. 
- mark it as interrupted. this will help us with soft resumes in the future. statuses: running, completed, cancelled, interrupted.
- we do not allow this
- yes 
  •	Planned = target_ms you already have.
  •	Actual active = active_ms accumulator.
	•	Wall time elapsed (optional) = stopped_at - started_at.


4. 
right now the audio player is in a separate file
we're showing the test inteface rn for phase 1. 
also put that in a separate file just for safekeeping, then we can write our new stuff

5. 
- yes
- remaining time
- just text for now, but plan for progress bar

6. 
- for now selectable from frontend with preset options

7. 
- Let React manage smooth animation with a local 250 ms interval, but sync to Rust via transition events + a 5–10 s heartbeat 
- 

8. 
- stop but dont create session record. user clicks end to finalize

9.
- Create dummy/placeholder readings for testing

10. 
-  push-first with events from Rust, plus a tiny pull on mount or when you suspect desync.

11. 
- keep it lean—only the sessions table. Add readings/segments in Phase 3+.

12. 
Ill just manual for now if we need test I"ll ask

13. 
looks good

14. 
- simplified flow (start → stop/end) for P0
