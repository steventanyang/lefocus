mod types;

pub use types::{CaptureMetrics, MetricsSnapshot, SystemMetrics};

use std::sync::Arc;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tokio::sync::Mutex;

const MAX_RECENT_CAPTURES: usize = 20;

pub struct MetricsCollector {
    inner: Arc<Mutex<MetricsState>>,
}

struct MetricsState {
    recent_captures: Vec<CaptureMetrics>,
    capture_count: u64,
    ocr_count: u64,
    ocr_skip_count: u64,
    system: System,
    pid: Pid,
}

impl MetricsCollector {
    pub fn new() -> Self {
        let mut system = System::new();
        let pid = Pid::from_u32(std::process::id());
        
        // Initial refresh to establish baseline for CPU calculation
        system.refresh_processes(ProcessesToUpdate::Some(&[pid]));
        
        Self {
            inner: Arc::new(Mutex::new(MetricsState {
                recent_captures: Vec::with_capacity(MAX_RECENT_CAPTURES),
                capture_count: 0,
                ocr_count: 0,
                ocr_skip_count: 0,
                system,
                pid,
            })),
        }
    }

    /// Sample current CPU and memory usage. Call this during each capture.
    /// CPU usage requires multiple refreshes over time to calculate delta.
    pub async fn sample_system_metrics(&self) -> (f32, f64) {
        let mut state = self.inner.lock().await;
        let pid = state.pid;
        state.system.refresh_processes(ProcessesToUpdate::Some(&[pid]));
        
        if let Some(process) = state.system.process(pid) {
            (
                process.cpu_usage(),
                process.memory() as f64 / 1024.0 / 1024.0,
            )
        } else {
            (0.0, 0.0)
        }
    }

    pub async fn record_capture(&self, metrics: CaptureMetrics) {
        let mut state = self.inner.lock().await;
        
        state.capture_count += 1;
        
        if metrics.ocr_ms.is_some() {
            state.ocr_count += 1;
        } else if metrics.ocr_skipped_reason.is_some() {
            state.ocr_skip_count += 1;
        }
        
        state.recent_captures.push(metrics);
        
        if state.recent_captures.len() > MAX_RECENT_CAPTURES {
            state.recent_captures.remove(0);
        }
    }

    pub async fn get_snapshot(&self) -> MetricsSnapshot {
        let mut state = self.inner.lock().await;
        let pid = state.pid;
        
        // Refresh to get current CPU/RAM
        state.system.refresh_processes(ProcessesToUpdate::Some(&[pid]));
        
        let system_metrics = if let Some(process) = state.system.process(pid) {
            SystemMetrics {
                cpu_percent: process.cpu_usage(),
                memory_mb: process.memory() as f64 / 1024.0 / 1024.0,
            }
        } else {
            SystemMetrics {
                cpu_percent: 0.0,
                memory_mb: 0.0,
            }
        };
        
        MetricsSnapshot {
            system: system_metrics,
            recent_captures: state.recent_captures.clone(),
            capture_count: state.capture_count,
            ocr_count: state.ocr_count,
            ocr_skip_count: state.ocr_skip_count,
        }
    }

    pub async fn reset(&self) {
        let mut state = self.inner.lock().await;
        let pid = state.pid;
        state.recent_captures.clear();
        state.capture_count = 0;
        state.ocr_count = 0;
        state.ocr_skip_count = 0;
        // Re-establish baseline for CPU after reset
        state.system.refresh_processes(ProcessesToUpdate::Some(&[pid]));
    }
}

impl Clone for MetricsCollector {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}
