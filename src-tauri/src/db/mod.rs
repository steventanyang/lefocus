use std::{
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    thread::{self, JoinHandle},
};

use anyhow::{Context, Result};
use log::{error, info};
use rusqlite::Connection;
use tokio::sync::oneshot;

mod migrations;

use migrations::run_migrations;

type DbTask = Box<dyn FnOnce(&mut Connection) + Send + 'static>;

enum DbCommand {
    Execute(DbTask),
    Shutdown,
}

struct DatabaseInner {
    sender: mpsc::Sender<DbCommand>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl Drop for DatabaseInner {
    fn drop(&mut self) {
        let mut guard = match self.worker.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };

        if let Some(handle) = guard.take() {
            if let Err(err) = self.sender.send(DbCommand::Shutdown) {
                error!("Failed to send shutdown to DB thread: {err}");
            }
            if let Err(join_err) = handle.join() {
                error!("Failed to join DB thread: {join_err:?}");
            }
        }
    }
}

#[derive(Clone)]
pub struct Database {
    inner: Arc<DatabaseInner>,
    db_path: Arc<PathBuf>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).with_context(|| {
                format!("failed to create database directory {}", parent.display())
            })?;
        }

        let (command_tx, command_rx) = mpsc::channel::<DbCommand>();
        let (ready_tx, ready_rx) = mpsc::channel();
        let path_for_thread = db_path.clone();

        let worker = thread::Builder::new()
            .name("lefocus-db".into())
            .spawn(move || {
                let mut conn = match Connection::open(&path_for_thread) {
                    Ok(connection) => connection,
                    Err(err) => {
                        let _ = ready_tx.send(Err(anyhow::Error::new(err)
                            .context("failed to open SQLite database")));
                        return;
                    }
                };

                if let Err(err) = conn.pragma_update(None, "journal_mode", "WAL") {
                    error!("Failed to enable WAL mode: {err}");
                }
                if let Err(err) = conn.pragma_update(None, "foreign_keys", "ON") {
                    error!("Failed to enable foreign keys: {err}");
                }

                let init_result =
                    run_migrations(&mut conn).context("failed to run database migrations");
                if ready_tx.send(init_result).is_err() {
                    error!("DB initialization receiver dropped before ready signal");
                    return;
                }

                while let Ok(command) = command_rx.recv() {
                    match command {
                        DbCommand::Execute(task) => {
                            task(&mut conn);
                        }
                        DbCommand::Shutdown => break,
                    }
                }

                info!("Database thread shutting down");
            })
            .with_context(|| "failed to spawn database worker thread")?;

        ready_rx
            .recv()
            .context("database worker exited before signaling readiness")??;

        info!(
            "Database initialized at {}",
            db_path.as_path().display()
        );

        Ok(Self {
            inner: Arc::new(DatabaseInner {
                sender: command_tx,
                worker: Mutex::new(Some(worker)),
            }),
            db_path: Arc::new(db_path),
        })
    }

    pub fn path(&self) -> &Path {
        self.db_path.as_path()
    }

    pub async fn execute<F, T>(&self, task: F) -> Result<T>
    where
        F: FnOnce(&mut Connection) -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        let sender = self.inner.sender.clone();
        let (reply_tx, reply_rx) = oneshot::channel();

        let command = DbCommand::Execute(Box::new(move |conn| {
            let result = task(conn);
            if reply_tx.send(result).is_err() {
                error!("DB caller dropped before receiving result");
            }
        }));

        sender
            .send(command)
            .map_err(|err| anyhow::anyhow!("failed to send command to DB thread: {err}"))?;

        reply_rx
            .await
            .map_err(|_| anyhow::anyhow!("database thread terminated unexpectedly"))?
    }
}
