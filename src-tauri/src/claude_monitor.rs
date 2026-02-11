use log;
use std::collections::{HashMap, HashSet};
use sysinfo::{System, ProcessesToUpdate, ProcessRefreshKind, UpdateKind};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SessionState {
    Thinking,       // No children, CPU > 2%
    Executing,      // Has child processes
    Waiting,        // No children, CPU ≤ 2%
    Done,           // Process exited
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
    previous_pids: HashSet<u32>,
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
            previous_pids: HashSet::new(),
            done_sessions: Vec::new(),
            own_pid: std::process::id(),
            poll_count: 0,
        }
    }

    /// Poll processes and return the current set of Claude sessions.
    pub fn poll(&mut self) -> Vec<ClaudeSession> {
        self.poll_count += 1;

        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            ProcessRefreshKind::new()
                .with_cpu()
                .with_exe(UpdateKind::OnlyIfNotSet),
        );

        // Pass 1: Find all Claude PIDs and record CPU
        let mut claude_pids = HashSet::new();
        let mut cpu_by_pid: HashMap<u32, f32> = HashMap::new();

        for (pid, process) in self.system.processes() {
            let pid_u32 = pid.as_u32();

            if pid_u32 == self.own_pid {
                continue;
            }

            if !is_claude_process(process) {
                continue;
            }

            claude_pids.insert(pid_u32);

            // Record CPU sample
            let cpu = process.cpu_usage();
            let history = self.cpu_history.entry(pid_u32).or_insert_with(Vec::new);
            history.push(cpu);
            if history.len() > 3 {
                history.remove(0);
            }

            let avg_cpu: f32 = history.iter().sum::<f32>() / history.len() as f32;
            cpu_by_pid.insert(pid_u32, avg_cpu);
        }

        // Pass 2: Check all processes for children of Claude PIDs
        let mut has_children = HashSet::new();
        let mut is_sub_agent = HashSet::new();

        for (_, process) in self.system.processes() {
            if let Some(parent_pid) = process.parent() {
                let parent_u32 = parent_pid.as_u32();
                if claude_pids.contains(&parent_u32) {
                    has_children.insert(parent_u32);
                    // If this child is also a Claude process, it's a sub-agent
                    let child_u32 = process.pid().as_u32();
                    if claude_pids.contains(&child_u32) {
                        is_sub_agent.insert(child_u32);
                    }
                }
            }
        }

        // Classify sessions (skip sub-agents — only show top-level sessions)
        let mut sessions = Vec::new();

        let mut sorted_pids: Vec<u32> = claude_pids.iter().copied().collect();
        sorted_pids.sort();

        for &pid_u32 in &sorted_pids {
            if is_sub_agent.contains(&pid_u32) {
                continue;
            }
            let avg_cpu = cpu_by_pid.get(&pid_u32).copied().unwrap_or(0.0);
            let state = if has_children.contains(&pid_u32) {
                SessionState::Executing
            } else if avg_cpu > 2.0 {
                SessionState::Thinking
            } else {
                SessionState::Waiting
            };

            sessions.push(ClaudeSession {
                pid: pid_u32,
                state,
                age_secs: 0.0,
            });
        }

        // Detect exits: PIDs that were present last poll but are gone now
        for &old_pid in &self.previous_pids {
            if !claude_pids.contains(&old_pid) {
                self.cpu_history.remove(&old_pid);
                self.done_sessions.push((old_pid, std::time::Instant::now()));
            }
        }

        // Add done sessions (green dots) that haven't expired
        self.done_sessions.retain(|(_, when)| when.elapsed().as_secs_f32() < 3.0);
        for &(pid, when) in &self.done_sessions {
            sessions.push(ClaudeSession {
                pid,
                state: SessionState::Done,
                age_secs: when.elapsed().as_secs_f32(),
            });
        }

        self.previous_pids = claude_pids;

        // Log periodically (every 5th poll = every 10s)
        if self.poll_count % 5 == 1 {
            let children_count = has_children.len();
            log::info!(
                "[claude_monitor] poll #{}: found {} claude sessions ({} with children), total processes={}",
                self.poll_count,
                sessions.len(),
                children_count,
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
