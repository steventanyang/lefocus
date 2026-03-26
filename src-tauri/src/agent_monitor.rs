use log;
use std::collections::{HashMap, HashSet, VecDeque};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SessionState {
    Thinking,       // No children, TCP data actively streaming
    Executing,      // Has active subprocess work (tree/cpu signals)
    Waiting,        // No children, TCP idle or no connection
    #[allow(dead_code)] // Reserved for future exit detection
    Done, // Process exited
}

#[derive(Debug, Clone)]
pub struct AgentSession {
    pub pid: u32,
    pub state: SessionState,
    pub age_secs: f32,
}

/// How many polls a PID stays "Thinking" after we last saw sbi_cc > 0.
/// At 2s poll interval, 2 polls = 4s hold — covers momentary buffer drains
/// between streaming chunks without prolonging stale state.
const THINKING_HOLD_POLLS: u64 = 2;
/// Minimum CPU% to consider a Codex session actively executing.
/// Codex often stays in low single-digit CPU while streaming/processing.
const CPU_EXEC_THRESHOLD_PCT: f32 = 0.8;
/// How many polls to hold Executing after last CPU-busy sample.
const CPU_EXEC_HOLD_POLLS: u64 = 3;

/// Tracks agent terminal sessions (Claude Code / Codex CLI) by scanning processes.
pub struct AgentMonitor {
    system: System,
    /// Our own PID so we can filter ourselves out
    own_pid: u32,
    poll_count: u64,
    /// Per-PID: poll_count when we last saw sbi_cc > 0 (Thinking signal).
    /// Used to debounce Thinking → Waiting transitions so fast buffer
    /// drains don't flicker the dot.
    last_thinking_at: HashMap<u32, u64>,
    /// Per-PID: poll_count when Codex CPU was above executing threshold.
    /// Used to avoid flicker when CPU briefly dips between polls.
    last_cpu_busy_at: HashMap<u32, u64>,
}

impl AgentMonitor {
    pub fn new() -> Self {
        log::info!("[agent_monitor] AgentMonitor created, own_pid={}", std::process::id());
        Self {
            system: System::new(),
            own_pid: std::process::id(),
            poll_count: 0,
            last_thinking_at: HashMap::new(),
            last_cpu_busy_at: HashMap::new(),
        }
    }

    /// Poll processes and return the current set of agent sessions.
    pub fn poll(&mut self) -> Vec<AgentSession> {
        self.poll_count += 1;

        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            ProcessRefreshKind::new()
                .with_exe(UpdateKind::OnlyIfNotSet)
                .with_cpu(),
        );

        // Pass 1: Find all agent PIDs
        let mut agent_pids = HashSet::new();

        for (pid, process) in self.system.processes() {
            let pid_u32 = pid.as_u32();

            if pid_u32 == self.own_pid {
                continue;
            }

            if !is_agent_process(process) {
                continue;
            }

            agent_pids.insert(pid_u32);
        }

        // Pass 2: Build parent->children graph and mark sub-agents.
        let mut children_by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
        let mut is_sub_agent = HashSet::new();

        for (pid, process) in self.system.processes() {
            let child_u32 = pid.as_u32();
            if let Some(parent_pid) = process.parent() {
                let parent_u32 = parent_pid.as_u32();
                children_by_parent
                    .entry(parent_u32)
                    .or_default()
                    .push(child_u32);
                // If this child is also an agent process, it's a sub-agent.
                if agent_pids.contains(&parent_u32) && agent_pids.contains(&child_u32) {
                    is_sub_agent.insert(child_u32);
                }
            }
        }

        // Classify sessions (skip sub-agents — only show top-level sessions)
        let mut sessions = Vec::new();

        let mut sorted_pids: Vec<u32> = agent_pids.iter().copied().collect();
        sorted_pids.sort();

        let mut session_reasons: Vec<(u32, &'static str, f32)> = Vec::new();
        let mut descendant_exec_count = 0usize;
        let mut cpu_exec_count = 0usize;
        let mut thinking_count = 0usize;

        for &pid_u32 in &sorted_pids {
            if is_sub_agent.contains(&pid_u32) {
                continue;
            }

            let has_exec_descendant =
                has_non_agent_descendant(pid_u32, &children_by_parent, &agent_pids);
            if has_exec_descendant {
                descendant_exec_count += 1;
            }

            let activity = net_check::get_tcp_activity(pid_u32);
            let has_tcp_socket = activity.is_some();
            let buf_nonzero = matches!(activity, Some(n) if n > 0);

            if buf_nonzero {
                self.last_thinking_at.insert(pid_u32, self.poll_count);
            }

            let recently_thinking = self
                .last_thinking_at
                .get(&pid_u32)
                .map_or(false, |&at| self.poll_count.saturating_sub(at) < THINKING_HOLD_POLLS);

            let (cpu_usage, codex_cpu_busy_now) =
                if let Some(process) = self.system.process(Pid::from_u32(pid_u32)) {
                    let cpu = process.cpu_usage();
                    let codex_busy = is_codex_process(process)
                        && has_tcp_socket
                        && cpu >= CPU_EXEC_THRESHOLD_PCT;
                    (cpu, codex_busy)
                } else {
                    (0.0, false)
                };
            if codex_cpu_busy_now {
                self.last_cpu_busy_at.insert(pid_u32, self.poll_count);
            }
            let recently_cpu_busy = self.last_cpu_busy_at.get(&pid_u32).map_or(false, |&at| {
                self.poll_count.saturating_sub(at) < CPU_EXEC_HOLD_POLLS
            });

            let (state, reason) = if has_exec_descendant {
                (SessionState::Executing, "exec:descendant")
            } else if recently_cpu_busy {
                cpu_exec_count += 1;
                (SessionState::Executing, "exec:cpu")
            } else if buf_nonzero || recently_thinking {
                thinking_count += 1;
                (SessionState::Thinking, "thinking:tcp")
            } else {
                (SessionState::Waiting, "waiting:idle")
            };

            sessions.push(AgentSession {
                pid: pid_u32,
                state,
                age_secs: 0.0,
            });
            session_reasons.push((pid_u32, reason, cpu_usage));
        }

        // Clean up debounce state for exited PIDs.
        self.last_thinking_at.retain(|pid, _| agent_pids.contains(pid));
        self.last_cpu_busy_at.retain(|pid, _| agent_pids.contains(pid));

        // Log periodically (every 5th poll = every 10s)
        if self.poll_count % 5 == 1 {
            log::info!(
                "[agent_monitor] poll #{}: found {} agent sessions (exec_desc={}, exec_cpu={}, thinking={}), total processes={}",
                self.poll_count,
                sessions.len(),
                descendant_exec_count,
                cpu_exec_count,
                thinking_count,
                self.system.processes().len()
            );
            for s in &sessions {
                let (reason, cpu) = session_reasons
                    .iter()
                    .find(|(pid, _, _)| *pid == s.pid)
                    .map_or(("unknown", 0.0), |(_, reason, cpu)| (*reason, *cpu));
                log::info!(
                    "[agent_monitor]   pid={} state={:?} reason={} cpu={:.1}% age={}",
                    s.pid, s.state, reason, cpu, s.age_secs
                );
            }
        }

        sessions
    }
}

fn has_non_agent_descendant(
    root_pid: u32,
    children_by_parent: &HashMap<u32, Vec<u32>>,
    agent_pids: &HashSet<u32>,
) -> bool {
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();
    queue.push_back(root_pid);

    while let Some(current) = queue.pop_front() {
        if !visited.insert(current) {
            continue;
        }

        if let Some(children) = children_by_parent.get(&current) {
            for &child in children {
                if !agent_pids.contains(&child) {
                    return true;
                }
                queue.push_back(child);
            }
        }
    }

    false
}

fn is_agent_process(process: &sysinfo::Process) -> bool {
    let name = process.name().to_string_lossy();
    if name == "claude" || name.starts_with("claude-") {
        return true;
    }
    if name == "codex" || name.starts_with("codex-") {
        return true;
    }

    if let Some(exe) = process.exe() {
        let exe_str = exe.to_string_lossy();
        if (exe_str.contains("claude") || exe_str.contains("codex"))
            && !exe_str.contains("lefocus")
        {
            return true;
        }
    }

    false
}

fn is_codex_process(process: &sysinfo::Process) -> bool {
    let name = process.name().to_string_lossy();
    if name == "codex" || name.starts_with("codex-") {
        return true;
    }

    if let Some(exe) = process.exe() {
        return exe.to_string_lossy().contains("codex");
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_agent_direct_child_is_executing_signal() {
        let mut children_by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
        children_by_parent.insert(100, vec![200]);
        let agent_pids = HashSet::from([100u32]);

        assert!(has_non_agent_descendant(100, &children_by_parent, &agent_pids));
    }

    #[test]
    fn non_agent_deep_descendant_is_executing_signal() {
        let mut children_by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
        children_by_parent.insert(100, vec![101]);
        children_by_parent.insert(101, vec![202]);
        let agent_pids = HashSet::from([100u32, 101u32]);

        assert!(has_non_agent_descendant(100, &children_by_parent, &agent_pids));
    }

    #[test]
    fn agent_only_descendants_are_not_executing_signal() {
        let mut children_by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
        children_by_parent.insert(100, vec![101]);
        children_by_parent.insert(101, vec![102]);
        let agent_pids = HashSet::from([100u32, 101u32, 102u32]);

        assert!(!has_non_agent_descendant(100, &children_by_parent, &agent_pids));
    }
}

// ---------------------------------------------------------------------------
// TCP activity detection via libproc (macOS only)
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod net_check {
    use std::os::raw::c_void;

    extern "C" {
        fn proc_pidinfo(
            pid: i32,
            flavor: i32,
            arg: u64,
            buf: *mut c_void,
            bufsize: i32,
        ) -> i32;

        fn proc_pidfdinfo(
            pid: i32,
            fd: i32,
            flavor: i32,
            buf: *mut c_void,
            bufsize: i32,
        ) -> i32;
    }

    const PROC_PIDLISTFDS: i32 = 1;
    const PROC_PIDFDSOCKETINFO: i32 = 3;
    const PROX_FDTYPE_SOCKET: u32 = 2;
    const SOCKINFO_TCP: i32 = 2;
    const TSI_S_ESTABLISHED: i32 = 4;

    // ---- #[repr(C)] structs matching <sys/proc_info.h> ----------------------

    #[derive(Copy, Clone)]
    #[repr(C)]
    struct proc_fdinfo {
        proc_fd: i32,
        proc_fdtype: u32,
    }

    /// in_sockinfo (80 bytes). We only need `insi_fport`.
    #[derive(Copy, Clone)]
    #[repr(C, align(8))]
    struct in_sockinfo {
        insi_fport: i32,
        _rest: [u8; 76],
    }

    /// tcp_sockinfo (120 bytes). We need `tcpsi_ini` and `tcpsi_state`.
    #[derive(Copy, Clone)]
    #[repr(C)]
    struct tcp_sockinfo {
        tcpsi_ini: in_sockinfo,
        tcpsi_state: i32,
        _rest: [u8; 36],
    }

    /// sockbuf_info (24 bytes). We need `sbi_cc` (current byte count in buffer).
    #[derive(Copy, Clone)]
    #[repr(C)]
    struct sockbuf_info {
        sbi_cc: u32,
        _rest: [u8; 20],
    }

    /// The `soi_proto` union (528 bytes). We only access `pri_tcp`.
    #[derive(Copy, Clone)]
    #[repr(C)]
    union soi_proto_union {
        pri_tcp: tcp_sockinfo,
        _size: [u8; 528],
    }

    /// socket_info (768 bytes).
    #[repr(C)]
    struct socket_info {
        _before_rcv: [u8; 184],
        soi_rcv: sockbuf_info,
        _soi_snd: sockbuf_info,
        soi_kind: i32,
        _rfu_1: u32,
        soi_proto: soi_proto_union,
    }

    /// socket_fdinfo (792 bytes) — returned by PROC_PIDFDSOCKETINFO.
    #[repr(C)]
    struct socket_fdinfo {
        _pfi: [u8; 24],
        psi: socket_info,
    }

    // Compile-time size checks — build fails immediately if layout is wrong.
    const _: () = {
        assert!(std::mem::size_of::<proc_fdinfo>() == 8);
        assert!(std::mem::size_of::<in_sockinfo>() == 80);
        assert!(std::mem::size_of::<tcp_sockinfo>() == 120);
        assert!(std::mem::size_of::<sockbuf_info>() == 24);
        assert!(std::mem::size_of::<socket_info>() == 768);
        assert!(std::mem::size_of::<socket_fdinfo>() == 792);
    };

    /// Returns the total TCP receive-buffer byte count across all ESTABLISHED
    /// port-443 sockets for `pid`. Returns `None` if no matching sockets found.
    ///
    /// When the API is actively streaming a response, `sbi_cc > 0` at any given
    /// snapshot. When the connection is idle (keep-alive), `sbi_cc == 0`.
    pub fn get_tcp_activity(pid: u32) -> Option<u64> {
        let pid_i32 = pid as i32;
        let fd_size = std::mem::size_of::<proc_fdinfo>() as i32;

        // First call: get required buffer size
        let buf_len =
            unsafe { proc_pidinfo(pid_i32, PROC_PIDLISTFDS, 0, std::ptr::null_mut(), 0) };
        if buf_len <= 0 {
            return None;
        }

        // Allocate buffer (add 20% headroom for FDs opened between calls)
        let capacity = (buf_len as usize + buf_len as usize / 5).max(buf_len as usize);
        let mut fd_buf: Vec<u8> = vec![0u8; capacity];

        let actual = unsafe {
            proc_pidinfo(
                pid_i32,
                PROC_PIDLISTFDS,
                0,
                fd_buf.as_mut_ptr() as *mut c_void,
                capacity as i32,
            )
        };
        if actual <= 0 {
            return None;
        }

        let fd_count = actual as usize / fd_size as usize;
        let fds = unsafe {
            std::slice::from_raw_parts(fd_buf.as_ptr() as *const proc_fdinfo, fd_count)
        };

        let mut total_buffered: u64 = 0;
        let mut found_any = false;

        let sfi_size = std::mem::size_of::<socket_fdinfo>() as i32;

        for fd in fds {
            if fd.proc_fdtype != PROX_FDTYPE_SOCKET {
                continue;
            }

            let mut sfi = std::mem::MaybeUninit::<socket_fdinfo>::uninit();
            let ret = unsafe {
                proc_pidfdinfo(
                    pid_i32,
                    fd.proc_fd,
                    PROC_PIDFDSOCKETINFO,
                    sfi.as_mut_ptr() as *mut c_void,
                    sfi_size,
                )
            };
            if ret != sfi_size {
                continue;
            }

            let sfi = unsafe { sfi.assume_init_ref() };

            if sfi.psi.soi_kind != SOCKINFO_TCP {
                continue;
            }

            let tcp = unsafe { &sfi.psi.soi_proto.pri_tcp };
            if tcp.tcpsi_state != TSI_S_ESTABLISHED {
                continue;
            }
            // proc_info reports ports in network byte order.
            let remote_port = u16::from_be(tcp.tcpsi_ini.insi_fport as u16);
            if remote_port != 443 {
                continue;
            }

            total_buffered += sfi.psi.soi_rcv.sbi_cc as u64;
            found_any = true;
        }

        if found_any {
            Some(total_buffered)
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod net_check {
    /// Stub for non-macOS platforms — always returns None.
    pub fn get_tcp_activity(_pid: u32) -> Option<u64> {
        None
    }
}
