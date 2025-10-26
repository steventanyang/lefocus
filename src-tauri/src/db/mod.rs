use std::{
    convert::TryFrom,
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    thread::{self, JoinHandle},
};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use log::{error, info};
use rusqlite::{params, Connection, Row};
use tokio::sync::oneshot;

mod migrations;

use crate::models::{Session, SessionStatus};
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

fn to_i64(value: u64) -> Result<i64> {
    i64::try_from(value).map_err(|_| anyhow!("value {value} exceeds SQLite INTEGER range"))
}

fn to_u64(value: i64, field: &str) -> Result<u64> {
    u64::try_from(value).map_err(|_| anyhow!("{field} contains negative value {value}"))
}

fn parse_datetime(value: &str, field: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .with_context(|| format!("failed to parse {field}"))
}

fn parse_optional_datetime(value: Option<String>, field: &str) -> Result<Option<DateTime<Utc>>> {
    match value {
        Some(raw) => parse_datetime(&raw, field).map(Some),
        None => Ok(None),
    }
}

fn parse_status(value: &str) -> Result<SessionStatus> {
    match value {
        "Running" => Ok(SessionStatus::Running),
        "Completed" => Ok(SessionStatus::Completed),
        "Cancelled" => Ok(SessionStatus::Cancelled),
        "Interrupted" => Ok(SessionStatus::Interrupted),
        other => Err(anyhow!("unknown session status {other}")),
    }
}

fn row_to_session(row: &Row) -> Result<Session> {
    let started_at: String = row.get("started_at")?;
    let stopped_at: Option<String> = row.get("stopped_at")?;
    let created_at: String = row.get("created_at")?;
    let updated_at: String = row.get("updated_at")?;
    let status: String = row.get("status")?;
    let target_ms: i64 = row.get("target_ms")?;
    let active_ms: i64 = row.get("active_ms")?;
    Ok(Session {
        id: row.get("id")?,
        started_at: parse_datetime(&started_at, "started_at")?,
        stopped_at: parse_optional_datetime(stopped_at, "stopped_at")?,
        status: parse_status(&status)?,
        target_ms: to_u64(target_ms, "target_ms")?,
        active_ms: to_u64(active_ms, "active_ms")?,
        created_at: parse_datetime(&created_at, "created_at")?,
        updated_at: parse_datetime(&updated_at, "updated_at")?,
    })
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
                        let _ =
                            ready_tx
                                .send(Err(anyhow::Error::new(err)
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

        info!("Database initialized at {}", db_path.as_path().display());

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
            .map_err(|err| anyhow!("failed to send command to DB thread: {err}"))?;

        reply_rx
            .await
            .map_err(|_| anyhow!("database thread terminated unexpectedly"))?
    }

    pub async fn insert_session(&self, session: &Session) -> Result<()> {
        let record = session.clone();
        self.execute(move |conn| {
            conn.execute(
                "INSERT INTO sessions (id, started_at, stopped_at, status, target_ms, active_ms, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    record.id,
                    record.started_at.to_rfc3339(),
                    record
                        .stopped_at
                        .as_ref()
                        .map(|dt| dt.to_rfc3339()),
                    record.status.as_str(),
                    to_i64(record.target_ms)?,
                    to_i64(record.active_ms)?,
                    record.created_at.to_rfc3339(),
                    record.updated_at.to_rfc3339(),
                ],
            )
            .with_context(|| "failed to insert session")?;
            Ok(())
        })
        .await
    }

    pub async fn update_session_progress(
        &self,
        session_id: &str,
        active_ms: u64,
        updated_at: DateTime<Utc>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            conn.execute(
                "UPDATE sessions
                 SET active_ms = ?1,
                     updated_at = ?2
                 WHERE id = ?3",
                params![to_i64(active_ms)?, updated_at.to_rfc3339(), session_id,],
            )
            .with_context(|| "failed to update session progress")?;
            Ok(())
        })
        .await
    }

    pub async fn mark_session_status(
        &self,
        session_id: &str,
        status: SessionStatus,
        active_ms: u64,
        stopped_at: Option<DateTime<Utc>>,
        updated_at: DateTime<Utc>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            conn.execute(
                "UPDATE sessions
                 SET status = ?1,
                     active_ms = ?2,
                     stopped_at = ?3,
                     updated_at = ?4
                 WHERE id = ?5",
                params![
                    status.as_str(),
                    to_i64(active_ms)?,
                    stopped_at.map(|dt| dt.to_rfc3339()),
                    updated_at.to_rfc3339(),
                    session_id,
                ],
            )
            .with_context(|| "failed to update session status")?;
            Ok(())
        })
        .await
    }

    pub async fn get_incomplete_session(&self) -> Result<Option<Session>> {
        self.execute(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, started_at, stopped_at, status, target_ms, active_ms, created_at, updated_at
                 FROM sessions
                 WHERE status = 'Running'
                 ORDER BY started_at DESC
                 LIMIT 1",
            )?;

            let mut rows = stmt.query([])?;
            let session = match rows.next()? {
                Some(row) => Some(row_to_session(&row)?),
                None => None,
            };
            Ok(session)
        })
        .await
    }

    pub async fn mark_session_interrupted(
        &self,
        session_id: &str,
        stopped_at: DateTime<Utc>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            conn.execute(
                "UPDATE sessions
                 SET status = ?1,
                     stopped_at = ?2,
                     updated_at = ?3
                 WHERE id = ?4",
                params![
                    SessionStatus::Interrupted.as_str(),
                    stopped_at.to_rfc3339(),
                    stopped_at.to_rfc3339(),
                    session_id,
                ],
            )
            .with_context(|| "failed to mark session as interrupted")?;
            Ok(())
        })
        .await
    }
}
