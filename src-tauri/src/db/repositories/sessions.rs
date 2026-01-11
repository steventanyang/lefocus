use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Row};

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
    let label_id: Option<i64> = row.get("label_id")?;
    let note: Option<String> = row.get("note")?;

    Ok(Session {
        id: row.get("id")?,
        started_at: parse_datetime(&started_at, "started_at")?,
        stopped_at: parse_optional_datetime(stopped_at, "stopped_at")?,
        status: parse_status(&status)?,
        target_ms: to_u64(target_ms, "target_ms")?,
        active_ms: to_u64(active_ms, "active_ms")?,
        label_id,
        note,
        created_at: parse_datetime(&created_at, "created_at")?,
        updated_at: parse_datetime(&updated_at, "updated_at")?,
    })
}

impl Database {
    pub async fn insert_session(&self, session: &Session) -> Result<()> {
        let record = session.clone();
        self.execute(move |conn| {
            conn.execute(
                "INSERT INTO sessions (id, started_at, stopped_at, status, target_ms, active_ms, label_id, created_at, updated_at)
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
                    record.label_id,
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

    pub async fn get_session(&self, session_id: &str) -> Result<Session> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, started_at, stopped_at, status, target_ms, active_ms, label_id, note, created_at, updated_at
                 FROM sessions
                 WHERE id = ?1",
            )?;

            let session = stmt
                .query_row(params![session_id], |row| Ok(row_to_session(row)))?
                .map_err(|e| anyhow::anyhow!("Failed to parse session: {}", e))?;

            Ok(session)
        })
        .await
    }

    pub async fn get_incomplete_session(&self) -> Result<Option<Session>> {
        self.execute(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, started_at, stopped_at, status, target_ms, active_ms, label_id, note, created_at, updated_at
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

    /// @deprecated Use list_sessions_paginated for better performance with large datasets.
    /// Kept for backward compatibility.
    pub async fn list_sessions(&self) -> Result<Vec<Session>> {
        self.execute(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, started_at, stopped_at, status, target_ms, active_ms, label_id, note, created_at, updated_at
                 FROM sessions
                 WHERE status IN ('Completed', 'Interrupted')
                 ORDER BY started_at DESC",
            )?;

            let mut rows = stmt.query([])?;
            let mut sessions = Vec::new();
            while let Some(row) = rows.next()? {
                sessions.push(row_to_session(row)?);
            }

            Ok(sessions)
        })
        .await
    }

    pub async fn list_sessions_paginated(
        &self,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Session>> {
        let limit = limit as i64;
        let offset = offset as i64;
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, started_at, stopped_at, status, target_ms, active_ms, label_id, note, created_at, updated_at
                 FROM sessions
                 WHERE status IN ('Completed', 'Interrupted')
                 ORDER BY started_at DESC
                 LIMIT ?1 OFFSET ?2",
            )?;

            let mut rows = stmt.query(params![limit, offset])?;
            let mut sessions = Vec::new();
            while let Some(row) = rows.next()? {
                sessions.push(row_to_session(row)?);
            }

            Ok(sessions)
        })
        .await
    }

    /// Update the label_id for a session
    pub async fn update_session_label(
        &self,
        session_id: &str,
        label_id: Option<i64>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            if let Some(label_id) = label_id {
                let exists: Option<i64> = conn
                    .query_row(
                        "SELECT id FROM labels WHERE id = ?1 AND deleted_at IS NULL",
                        params![label_id],
                        |row| row.get(0),
                    )
                    .optional()?;

                if exists.is_none() {
                    return Err(anyhow::anyhow!("Label not found or has been deleted"));
                }
            }

            let rows_affected = conn.execute(
                "UPDATE sessions
                 SET label_id = ?1,
                     updated_at = ?2
                 WHERE id = ?3",
                params![label_id, Utc::now().to_rfc3339(), session_id],
            )?;

            if rows_affected == 0 {
                return Err(anyhow::anyhow!("Session not found"));
            }

            Ok(())
        })
        .await
    }

    /// Update the note for a session
    pub async fn update_session_note(
        &self,
        session_id: &str,
        note: Option<String>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            let rows_affected = conn.execute(
                "UPDATE sessions
                 SET note = ?1,
                     updated_at = ?2
                 WHERE id = ?3",
                params![note, Utc::now().to_rfc3339(), session_id],
            )?;

            if rows_affected == 0 {
                return Err(anyhow::anyhow!("Session not found"));
            }

            Ok(())
        })
        .await
    }

    /// Delete a session and all its related data (segments, interruptions)
    /// 
    /// Note: `context_readings` are automatically deleted via ON DELETE CASCADE
    /// foreign key constraint (defined in schema_v4.sql). No manual deletion needed.
    pub async fn delete_session(&self, session_id: &str) -> Result<()> {
        let session_id = session_id.to_string();
        self.execute(move |conn| {
            let tx = conn.transaction()?;

            // 1. Delete interruptions for segments belonging to this session
            tx.execute(
                "DELETE FROM interruptions 
                 WHERE segment_id IN (SELECT id FROM segments WHERE session_id = ?1)",
                params![session_id],
            )?;

            // 2. Delete segments for this session
            tx.execute(
                "DELETE FROM segments WHERE session_id = ?1",
                params![session_id],
            )?;

            // 3. Delete the session itself
            // Note: context_readings are automatically deleted via ON DELETE CASCADE
            let rows_affected = tx.execute(
                "DELETE FROM sessions WHERE id = ?1",
                params![session_id],
            )?;

            if rows_affected == 0 {
                // Don't fail if session is already gone, just commit
            }

            tx.commit()?;
            Ok(())
        })
        .await
    }
}
