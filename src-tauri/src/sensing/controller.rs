use anyhow::{bail, Context, Result};
use log::info;
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::db::Database;
use crate::macos_bridge;

use super::loop_worker::sensing_loop;

pub struct SensingController {
    handle: Option<JoinHandle<()>>,
    cancel_token: Option<CancellationToken>,
    drain_tx: Option<watch::Sender<bool>>,
}

impl SensingController {
    pub fn new() -> Self {
        Self {
            handle: None,
            cancel_token: None,
            drain_tx: None,
        }
    }

    pub async fn start_sensing(&mut self, session_id: String, db: Database) -> Result<()> {
        if self.handle.is_some() {
            bail!("sensing already active");
        }

        // Clear the macOS sensing cache to prevent using stale window references
        // from previous sessions (especially after interrupted sessions)
        info!("Clearing macOS sensing cache before starting new session");
        macos_bridge::clear_cache();

        let cancel_token = CancellationToken::new();
        let token_clone = cancel_token.clone();

        // Create drain channel: false = normal operation, true = drain mode (finish current capture then exit)
        let (drain_tx, drain_rx) = watch::channel(false);
        let drain_rx_clone = drain_rx;

        let handle = tokio::spawn(sensing_loop(session_id, db, token_clone, drain_rx_clone));

        self.handle = Some(handle);
        self.cancel_token = Some(cancel_token);
        self.drain_tx = Some(drain_tx);
        Ok(())
    }

    /// Signal sensing loop to drain: finish current capture but don't start new ones
    pub fn drain_sensing(&mut self) {
        if let Some(tx) = &self.drain_tx {
            let _ = tx.send(true);
            info!("Drain signal sent to sensing loop");
        }
    }

    pub async fn stop_sensing(&mut self) -> Result<()> {
        if let Some(token) = self.cancel_token.take() {
            token.cancel();
        }

        if let Some(handle) = self.handle.take() {
            handle
                .await
                .context("sensing loop task failed to join")
                .map(|_| ())
        } else {
            Ok(())
        }
    }
}
