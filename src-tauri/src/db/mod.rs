use std::{
    convert::TryFrom,
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    thread::{self, JoinHandle},
};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use log::{error, info};
use rusqlite::{params, Connection};
use tokio::sync::oneshot;

mod migrations;

use migrations::run_migrations;
use crate::models::{Pause, Session, SessionStatus};

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
    i64::try_from(value)
        .map_err(|_| anyhow!("value {value} exceeds SQLite INTEGER range"))
}

fn parse_datetime(value: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|err| anyhow!("invalid datetime '{value}': {err}"))
}

fn status_from_str(value: &str) -> Result<SessionStatus> {
    match value {
        "Running" => Ok(SessionStatus::Running),
        "Paused" => Ok(SessionStatus::Paused),
        "Completed" => Ok(SessionStatus::Completed),
        "Cancelled" => Ok(SessionStatus::Cancelled),
        "Interrupted" => Ok(SessionStatus::Interrupted),
        _ => Err(anyhow!("unknown session status '{value}'")),
    }
}

fn to_u64(value: i64) -> Result<u64> {
    u64::try_from(value).map_err(|_| anyhow!("value {value} is negative"))
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
            .map_err(|err| anyhow!("failed to send command to DB thread: {err}"))?;

        reply_rx
            .await
            .map_err(|_| anyhow!("database thread terminated unexpectedly"))?
    }

    pub async fn insert_session(&self, session: &Session) -> Result<()> {
        let record = session.clone();
        self.execute(move |conn| {
            conn.execute(
                "INSERT INTO sessions (id, started_at, stopped_at, status, target_ms, active_ms, paused_ms, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
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
                    to_i64(record.paused_ms)?,
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
        paused_ms: u64,
        updated_at: DateTime<Utc>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            conn.execute(
                "UPDATE sessions
                 SET active_ms = ?1,
                     paused_ms = ?2,
                     updated_at = ?3
                 WHERE id = ?4",
                params![
                    to_i64(active_ms)?,
                    to_i64(paused_ms)?,
                    updated_at.to_rfc3339(),
                    session_id,
                ],
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
        paused_ms: u64,
        stopped_at: Option<DateTime<Utc>>,
        updated_at: DateTime<Utc>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            conn.execute(
                "UPDATE sessions
                 SET status = ?1,
                     active_ms = ?2,
                     paused_ms = ?3,
                     stopped_at = ?4,
                     updated_at = ?5
                 WHERE id = ?6",
                params![
                    status.as_str(),
                    to_i64(active_ms)?,
                    to_i64(paused_ms)?,
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

    pub async fn insert_pause(&self, pause: &Pause) -> Result<()> {
        let record = pause.clone();
        self.execute(move |conn| {
            conn.execute(
                "INSERT INTO pauses (id, session_id, pause_started_at, pause_ended_at, duration_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    record.id,
                    record.session_id,
                    record.pause_started_at.to_rfc3339(),
                    record
                        .pause_ended_at
                        .as_ref()
                        .map(|dt| dt.to_rfc3339()),
                    record
                        .duration_ms
                        .map(|ms| to_i64(ms))
                        .transpose()?,
                ],
            )
            .with_context(|| "failed to insert pause record")?;
            Ok(())
        })
        .await
    }

    pub async fn finalize_pause(
        &self,
        pause_id: &str,
        ended_at: DateTime<Utc>,
        duration_ms: u64,
    ) -> Result<()> {
        let pause_id = pause_id.to_string();
        self.execute(move |conn| {
            conn.execute(
                "UPDATE pauses
                 SET pause_ended_at = ?1,
                     duration_ms = ?2
                 WHERE id = ?3",
                params![
                    ended_at.to_rfc3339(),
                    to_i64(duration_ms)?,
                    pause_id,
                ],
            )
            .with_context(|| "failed to finalize pause record")?;
            Ok(())
        })
        .await
    }

    pub async fn get_open_pause(&self, session_id: &str) -> Result<Option<Pause>> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, session_id, pause_started_at, pause_ended_at, duration_ms
                 FROM pauses
                 WHERE session_id = ?1 AND pause_ended_at IS NULL
                 ORDER BY pause_started_at DESC
                 LIMIT 1",
            )?;

            let mut rows = stmt.query(params![session_id])?;
            if let Some(row) = rows.next()? {
                let pause = Pause {
                    id: row.get::<_, String>(0)?,
                    session_id: row.get::<_, String>(1)?,
                    pause_started_at: parse_datetime(&row.get::<_, String>(2)?)?,
                    pause_ended_at: None,
                    duration_ms: None,
                };
                Ok(Some(pause))
            } else {
                Ok(None)
            }
        })
        .await
    }

    pub async fn finalize_open_pauses(
        &self,
        session_id: &str,
        ended_at: DateTime<Utc>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, pause_started_at FROM pauses
                 WHERE session_id = ?1 AND pause_ended_at IS NULL",
            )?;

            let mut rows = stmt.query(params![session_id.clone()])?;
            while let Some(row) = rows.next()? {
                let pause_id: String = row.get(0)?;
                let started_at = parse_datetime(&row.get::<_, String>(1)?)?;
                let duration_ms = (ended_at - started_at)
                    .num_milliseconds()
                    .max(0) as u64;
                conn.execute(
                    "UPDATE pauses
                     SET pause_ended_at = ?1,
                         duration_ms = ?2
                     WHERE id = ?3",
                    params![
                        ended_at.to_rfc3339(),
                        to_i64(duration_ms)?,
                        pause_id,
                    ],
                )?;
            }

            Ok(())
        })
        .await
    }

    pub async fn get_incomplete_sessions(&self) -> Result<Vec<Session>> {
        self.execute(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, started_at, stopped_at, status, target_ms, active_ms, paused_ms, created_at, updated_at
                 FROM sessions
                 WHERE status IN ('Running', 'Paused')
                 ORDER BY started_at DESC",
            )?;

            let mut rows = stmt.query([])?;
            let mut sessions = Vec::new();
            while let Some(row) = rows.next()? {
                sessions.push(Session {
                    id: row.get(0)?,
                    started_at: parse_datetime(&row.get::<_, String>(1)?)?,
                    stopped_at: row
                        .get::<_, Option<String>>(2)?
                        .map(|s| parse_datetime(&s))
                        .transpose()?,
                    status: status_from_str(&row.get::<_, String>(3)?)?,
                    target_ms: to_u64(row.get::<_, i64>(4)?)?,
                    active_ms: to_u64(row.get::<_, i64>(5)?)?,
                    paused_ms: to_u64(row.get::<_, i64>(6)?)?,
                    created_at: parse_datetime(&row.get::<_, String>(7)?)?,
                    updated_at: parse_datetime(&row.get::<_, String>(8)?)?,
                });
            }

            Ok(sessions)
        })
        .await
    }
}
