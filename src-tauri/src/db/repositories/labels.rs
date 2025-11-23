use anyhow::{anyhow, bail, Result};
use chrono::Utc;
use rusqlite::{params, Row};

use crate::db::{
    connection::Database,
    helpers::{parse_datetime, parse_optional_datetime},
    models::Label,
};

const MAX_LABELS: i64 = 9;

fn row_to_label(row: &Row) -> Result<Label> {
    let created_at: String = row.get("created_at")?;
    let updated_at: String = row.get("updated_at")?;
    let deleted_at: Option<String> = row.get("deleted_at")?;

    Ok(Label {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        order_index: row.get("order_index")?,
        created_at: parse_datetime(&created_at, "created_at")?,
        updated_at: parse_datetime(&updated_at, "updated_at")?,
        deleted_at: parse_optional_datetime(deleted_at, "deleted_at")?,
    })
}

impl Database {
    /// Create a new label
    /// Returns an error if max labels (9) reached or name is duplicate
    pub async fn create_label(&self, name: String, color: String) -> Result<Label> {
        self.execute(move |conn| {
            let now = Utc::now();

            // Enforce the maximum label count within the same DB task to avoid races.
            let current_count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM labels WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )?;
            if current_count >= MAX_LABELS {
                bail!("Maximum of {} labels reached", MAX_LABELS);
            }

            // Find the smallest unused order_index so keyboard shortcuts stay within 1-9.
            let mut stmt = conn.prepare(
                "SELECT order_index FROM labels WHERE deleted_at IS NULL ORDER BY order_index ASC",
            )?;
            let mut rows = stmt.query([])?;
            let mut next_index = 0i64;
            while let Some(row) = rows.next()? {
                let current: i64 = row.get(0)?;
                if current > next_index {
                    break;
                }
                if current == next_index {
                    next_index += 1;
                }
            }

            // Insert the label
            conn.execute(
                "INSERT INTO labels (name, color, order_index, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![name, color, next_index, now.to_rfc3339(), now.to_rfc3339(),],
            )?;

            let label_id = conn.last_insert_rowid();

            // Retrieve the created label
            let mut stmt = conn.prepare(
                "SELECT id, name, color, order_index, created_at, updated_at, deleted_at
                 FROM labels
                 WHERE id = ?1",
            )?;
            let mut rows = stmt.query(params![label_id])?;
            let label = match rows.next()? {
                Some(row) => row_to_label(row)?,
                None => return Err(anyhow!("Label not found after insert")),
            };

            Ok(label)
        })
        .await
    }

    /// Get all non-deleted labels, ordered by order_index
    pub async fn get_labels(&self) -> Result<Vec<Label>> {
        self.execute(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, color, order_index, created_at, updated_at, deleted_at
                 FROM labels
                 WHERE deleted_at IS NULL
                 ORDER BY order_index ASC",
            )?;

            let mut rows = stmt.query([])?;
            let mut labels = Vec::new();
            while let Some(row) = rows.next()? {
                labels.push(row_to_label(row)?);
            }

            Ok(labels)
        })
        .await
    }

    /// Get a single label by ID
    // pub async fn get_label_by_id(&self, label_id: i64) -> Result<Option<Label>> {
    //     self.execute(move |conn| {
    //         let mut stmt = conn.prepare(
    //             "SELECT id, name, color, order_index, created_at, updated_at, deleted_at
    //              FROM labels
    //              WHERE id = ?1 AND deleted_at IS NULL",
    //         )?;

    //         let mut rows = stmt.query(params![label_id])?;
    //         let label = match rows.next()? {
    //             Some(row) => Some(row_to_label(row)?),
    //             None => None,
    //         };
    //         Ok(label)
    //     })
    //     .await
    // }

    /// Update a label's name and/or color
    /// Returns an error if name is duplicate
    pub async fn update_label(
        &self,
        label_id: i64,
        name: Option<String>,
        color: Option<String>,
    ) -> Result<Label> {
        self.execute(move |conn| {
            let now = Utc::now();

            // Build update query dynamically based on what's being updated
            let mut updates = Vec::new();
            let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

            if let Some(n) = name.clone() {
                updates.push("name = ?");
                params_vec.push(Box::new(n));
            }
            if let Some(c) = color.clone() {
                updates.push("color = ?");
                params_vec.push(Box::new(c));
            }

            if updates.is_empty() {
                return Err(anyhow!("No fields to update"));
            }

            updates.push("updated_at = ?");
            params_vec.push(Box::new(now.to_rfc3339()));

            let update_clause = updates.join(", ");
            let query = format!(
                "UPDATE labels SET {} WHERE id = ? AND deleted_at IS NULL",
                update_clause
            );

            params_vec.push(Box::new(label_id));

            // Convert to slice of trait objects for rusqlite
            let params_refs: Vec<&dyn rusqlite::ToSql> =
                params_vec.iter().map(|b| b.as_ref()).collect();

            let rows_affected = conn.execute(&query, params_refs.as_slice())?;

            if rows_affected == 0 {
                return Err(anyhow!("Label not found or already deleted"));
            }

            // Retrieve the updated label
            let mut stmt = conn.prepare(
                "SELECT id, name, color, order_index, created_at, updated_at, deleted_at
                 FROM labels
                 WHERE id = ?1",
            )?;
            let mut rows = stmt.query(params![label_id])?;
            let label = match rows.next()? {
                Some(row) => row_to_label(row)?,
                None => return Err(anyhow!("Label not found after update")),
            };

            Ok(label)
        })
        .await
    }

    /// Soft delete a label and set all sessions with this label to NULL
    pub async fn soft_delete_label(&self, label_id: i64) -> Result<()> {
        self.execute(move |conn| {
            let now = Utc::now();

            // Soft delete the label
            let rows_affected = conn.execute(
                "UPDATE labels
                 SET deleted_at = ?1, updated_at = ?2
                 WHERE id = ?3 AND deleted_at IS NULL",
                params![now.to_rfc3339(), now.to_rfc3339(), label_id],
            )?;

            if rows_affected == 0 {
                return Err(anyhow!("Label not found or already deleted"));
            }

            // Set label_id to NULL for all sessions that had this label
            conn.execute(
                "UPDATE sessions
                 SET label_id = NULL
                 WHERE label_id = ?1",
                params![label_id],
            )?;

            Ok(())
        })
        .await
    }
}
