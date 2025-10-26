use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Row};

use crate::db::{
    connection::Database,
    helpers::{parse_datetime, parse_optional_datetime, parse_status, to_i64, to_u64},
    models::{Session, SessionStatus},
};

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

impl Database {
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
            )?;
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
            )?;
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
            )?;
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
            )?;
            Ok(())
        })
        .await
    }
}
