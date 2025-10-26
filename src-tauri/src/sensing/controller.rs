use anyhow::{bail, Context, Result};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::db::Database;

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

    pub async fn start_sensing(&mut self, session_id: String, db: Database) -> Result<()> {
        if self.handle.is_some() {
            bail!("sensing already active");
        }

        let cancel_token = CancellationToken::new();
        let token_clone = cancel_token.clone();

        let handle = tokio::spawn(sensing_loop(session_id, db, token_clone));

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
