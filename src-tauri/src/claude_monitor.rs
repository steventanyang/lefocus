use log;
use std::collections::HashMap;
use sysinfo::{System, ProcessesToUpdate, ProcessRefreshKind};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SessionState {
    Working,
    NeedsAttention,
    Done,
}

#[derive(Debug, Clone)]
pub struct ClaudeSession {
    pub pid: u32,
    pub state: SessionState,
    pub age_secs: f32,
}

/// Tracks Claude Code CLI sessions by scanning processes.
pub struct ClaudeMonitor {
    system: System,
    /// Rolling CPU samples per PID (up to 3)
    cpu_history: HashMap<u32, Vec<f32>>,
    /// PIDs seen last poll — used to detect exits
    previous_pids: std::collections::HashSet<u32>,
    /// Recently-exited sessions kept around for the green "done" dot
    done_sessions: Vec<(u32, std::time::Instant)>,
    /// Our own PID so we can filter ourselves out
    own_pid: u32,
    poll_count: u64,
}

impl ClaudeMonitor {
    pub fn new() -> Self {
        log::info!("[claude_monitor] ClaudeMonitor created, own_pid={}", std::process::id());
        Self {
            system: System::new(),
            cpu_history: HashMap::new(),
            previous_pids: std::collections::HashSet::new(),
            done_sessions: Vec::new(),
            own_pid: std::process::id(),
            poll_count: 0,
        }
    }

    /// Poll processes and return the current set of Claude sessions.
    pub fn poll(&mut self) -> Vec<ClaudeSession> {
        self.poll_count += 1;

        // Use everything() to ensure process names and exe paths are populated
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            ProcessRefreshKind::everything(),
        );

        let mut current_pids = std::collections::HashSet::new();
        let mut sessions = Vec::new();

        for (pid, process) in self.system.processes() {
            let pid_u32 = pid.as_u32();

            // Skip ourselves
            if pid_u32 == self.own_pid {
                continue;
            }

            // Check if this looks like a Claude Code CLI process
            if !is_claude_process(process) {
                continue;
            }

            current_pids.insert(pid_u32);

            // Record CPU sample
            let cpu = process.cpu_usage();
            let history = self.cpu_history.entry(pid_u32).or_insert_with(Vec::new);
            history.push(cpu);
            if history.len() > 3 {
                history.remove(0);
            }

            // Classify state based on average CPU over samples
            let avg_cpu: f32 = history.iter().sum::<f32>() / history.len() as f32;
            let state = if avg_cpu > 5.0 {
                SessionState::Working
            } else {
                SessionState::NeedsAttention
            };

            sessions.push(ClaudeSession {
                pid: pid_u32,
                state,
                age_secs: 0.0,
            });
        }

        // Detect exits: PIDs that were present last poll but are gone now
        for &old_pid in &self.previous_pids {
            if !current_pids.contains(&old_pid) {
                self.cpu_history.remove(&old_pid);
                self.done_sessions.push((old_pid, std::time::Instant::now()));
            }
        }

        // Add done sessions (green dots) that haven't expired
        self.done_sessions.retain(|(_, when)| when.elapsed().as_secs_f32() < 8.0);
        for &(pid, when) in &self.done_sessions {
            sessions.push(ClaudeSession {
                pid,
                state: SessionState::Done,
                age_secs: when.elapsed().as_secs_f32(),
            });
        }

        self.previous_pids = current_pids;

        // Log periodically (every 5th poll = every 10s)
        if self.poll_count % 5 == 1 {
            log::info!(
                "[claude_monitor] poll #{}: found {} claude sessions, total processes={}",
                self.poll_count,
                sessions.len(),
                self.system.processes().len()
            );
            for s in &sessions {
                log::info!(
                    "[claude_monitor]   pid={} state={:?} age={}",
                    s.pid, s.state, s.age_secs
                );
            }
        }

        sessions
    }
}

fn is_claude_process(process: &sysinfo::Process) -> bool {
    // Check process name first (most reliable on macOS)
    let name = process.name().to_string_lossy();
    if name == "claude" || name.starts_with("claude-") {
        return true;
    }

    // Check executable path for "claude" — catches various install locations
    if let Some(exe) = process.exe() {
        let exe_str = exe.to_string_lossy();
        if exe_str.contains("claude") && !exe_str.contains("lefocus") {
            return true;
        }
    }

    false
}
