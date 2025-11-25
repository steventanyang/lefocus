use anyhow::{bail, Context, Result};
use log::info;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::db::Database;
use crate::macos_bridge;
use crate::metrics::MetricsCollector;

use super::icon_manager::IconManager;
use super::loop_worker::sensing_loop;

pub struct SensingController {
    handle: Option<JoinHandle<()>>,
    cancel_token: Option<CancellationToken>,
}

impl SensingController {
    pub fn new() -> Self {
        Self {
            handle: None,
            cancel_token: None,
        }
    }

    pub async fn start_sensing(
        &mut self,
        session_id: String,
        db: Database,
        metrics: MetricsCollector,
        app_handle: tauri::AppHandle,
    ) -> Result<()> {
        if self.handle.is_some() {
            bail!("sensing already active");
        }

        // Clear the macOS sensing cache to prevent using stale window references
        // from previous sessions (especially after interrupted sessions)
        info!("Clearing macOS sensing cache before starting new session");
        macos_bridge::clear_cache();

        // Reset metrics for new session
        metrics.reset().await;

        // Create icon manager for pre-fetching icons during the session
        let icon_manager = IconManager::new(db.clone());
        icon_manager.clear().await; // Clear any previous session's cache

        let cancel_token = CancellationToken::new();
        let token_clone = cancel_token.clone();

        let handle = tokio::spawn(sensing_loop(
            session_id,
            db,
            icon_manager,
            token_clone,
            metrics,
            app_handle,
        ));

        self.handle = Some(handle);
        self.cancel_token = Some(cancel_token);
        Ok(())
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
