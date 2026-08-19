use anyhow::{bail, Context, Result};
use rusqlite::{Connection, OptionalExtension, Transaction};
use std::collections::HashSet;
use std::path::Path;
use sysinfo::Disks;

const CURRENT_SCHEMA_VERSION: i32 = 13;

pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    let mut version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .context("failed to read user_version pragma")?;

    if version > CURRENT_SCHEMA_VERSION {
        bail!(
            "database version ({}) is newer than supported schema ({})",
            version,
            CURRENT_SCHEMA_VERSION
        );
    }

    if version == CURRENT_SCHEMA_VERSION {
        return Ok(());
    }

    // Some old databases contain readings whose sessions were deleted before
    // cascade behavior was reliable. Preserve those rows, but prove this
    // migration does not introduce any additional foreign-key violations.
    let existing_fk_violations = foreign_key_violations(conn)?;

    let foreign_keys_enabled: bool = conn
        .pragma_query_value(None, "foreign_keys", |row| row.get(0))
        .context("failed to read foreign_keys pragma")?;
    if foreign_keys_enabled {
        conn.pragma_update(None, "foreign_keys", false)
            .context("failed to suspend foreign keys for table-rebuilding migrations")?;
    }

    let migration_result = (|| -> Result<()> {
        let tx = conn
            .transaction()
            .context("failed to open migration transaction")?;

        while version < CURRENT_SCHEMA_VERSION {
            let next_version = version + 1;
            apply_migration(&tx, next_version)
                .with_context(|| format!("migration to version {next_version} failed"))?;
            version = next_version;
        }

        tx.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)
            .context("failed to update user_version pragma")?;
        let migrated_fk_violations = foreign_key_violations(&tx)?;
        if let Some(violation) = migrated_fk_violations
            .difference(&existing_fk_violations)
            .next()
        {
            bail!("migration produced a new foreign key violation: {violation:?}");
        }
        tx.commit().context("failed to commit migrations")
    })();

    let restore_result = if foreign_keys_enabled {
        conn.pragma_update(None, "foreign_keys", true)
            .context("failed to restore foreign keys after migrations")
    } else {
        Ok(())
    };

    match (migration_result, restore_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(migration_error), Ok(())) => Err(migration_error),
        (Ok(()), Err(restore_error)) => Err(restore_error),
        (Err(migration_error), Err(restore_error)) => Err(migration_error.context(format!(
            "foreign key restoration also failed: {restore_error}"
        ))),
    }?;

    Ok(())
}

type ForeignKeyViolation = (String, Option<i64>, String, i64);

fn foreign_key_violations(conn: &Connection) -> Result<HashSet<ForeignKeyViolation>> {
    let mut statement = conn
        .prepare("PRAGMA foreign_key_check")
        .context("failed to prepare foreign key validation")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?;
    rows.collect::<rusqlite::Result<HashSet<_>>>()
        .context("failed to read foreign key validation results")
}

/// Reclaim pages only on the launch after the legacy archive pass completed.
/// VACUUM is deliberately kept out of the migration and background archive job.
pub fn run_pending_storage_vacuum(conn: &mut Connection, db_path: &Path) -> Result<bool> {
    let pending: Option<String> = conn
        .query_row(
            "SELECT value FROM storage_maintenance WHERE key = 'legacy_vacuum_pending'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if pending.as_deref() != Some("1") {
        return Ok(false);
    }

    let db_size = std::fs::metadata(db_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
    let disks = Disks::new_with_refreshed_list();
    let available = disks
        .list()
        .iter()
        .filter(|disk| parent.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| disk.available_space())
        .ok_or_else(|| {
            anyhow::anyhow!("could not determine free space for {}", parent.display())
        })?;
    let required = db_size.saturating_mul(2).max(64 * 1024 * 1024);
    if available < required {
        bail!(
            "deferring database compaction: {} bytes free, {} required",
            available,
            required
        );
    }

    conn.execute_batch(
        "VACUUM;
         UPDATE storage_maintenance SET value = '0'
         WHERE key = 'legacy_vacuum_pending';
         UPDATE storage_maintenance SET value = '1'
         WHERE key = 'legacy_vacuum_done';
         PRAGMA wal_checkpoint(TRUNCATE);",
    )
    .context("failed to compact archived database")?;
    Ok(true)
}

fn apply_migration(tx: &Transaction<'_>, version: i32) -> Result<()> {
    match version {
        1 => {
            tx.execute_batch(include_str!("schemas/schema_v1.sql"))
                .context("failed to execute schema_v1.sql")?;
            Ok(())
        }
        2 => {
            tx.execute_batch(include_str!("schemas/schema_v2.sql"))
                .context("failed to execute schema_v2.sql")?;
            Ok(())
        }
        3 => {
            tx.execute_batch(include_str!("schemas/schema_v3.sql"))
                .context("failed to execute schema_v3.sql")?;
            Ok(())
        }
        4 => {
            tx.execute_batch(include_str!("schemas/schema_v4.sql"))
                .context("failed to execute schema_v4.sql")?;
            Ok(())
        }
        5 => {
            tx.execute_batch(include_str!("schemas/schema_v5.sql"))
                .context("failed to execute schema_v5.sql")?;
            Ok(())
        }
        6 => {
            tx.execute_batch(include_str!("schemas/schema_v6.sql"))
                .context("failed to execute schema_v6.sql")?;
            Ok(())
        }
        7 => {
            tx.execute_batch(include_str!("schemas/schema_v7.sql"))
                .context("failed to execute schema_v7.sql")?;
            Ok(())
        }
        8 => {
            tx.execute_batch(include_str!("schemas/schema_v8.sql"))
                .context("failed to execute schema_v8.sql")?;
            Ok(())
        }
        9 => {
            tx.execute_batch(include_str!("schemas/schema_v9.sql"))
                .context("failed to execute schema_v9.sql")?;
            Ok(())
        }
        10 => {
            tx.execute_batch(include_str!("schemas/schema_v10.sql"))
                .context("failed to execute schema_v10.sql")?;
            Ok(())
        }
        11 => {
            tx.execute_batch(include_str!("schemas/schema_v11.sql"))
                .context("failed to execute schema_v11.sql")?;
            Ok(())
        }
        12 => {
            tx.execute_batch(include_str!("schemas/schema_v12.sql"))
                .context("failed to execute schema_v12.sql")?;
            Ok(())
        }
        13 => {
            tx.execute_batch(include_str!("schemas/schema_v13.sql"))
                .context("failed to execute schema_v13.sql")?;
            Ok(())
        }
        _ => bail!("unknown migration target version: {version}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn rebuilding_labels_preserves_session_assignments() -> Result<()> {
        let mut conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", false)?;
        {
            let tx = conn.transaction()?;
            for version in 1..=10 {
                apply_migration(&tx, version)?;
            }
            tx.pragma_update(None, "user_version", 10)?;
            tx.commit()?;
        }
        conn.pragma_update(None, "foreign_keys", true)?;

        let now = "2026-08-19T12:00:00Z";
        conn.execute(
            "INSERT INTO labels (id, name, color, order_index, created_at, updated_at)
             VALUES (1, 'Deep work', '#123456', 0, ?1, ?1)",
            params![now],
        )?;
        conn.execute(
            "INSERT INTO sessions
             (id, started_at, stopped_at, status, target_ms, active_ms, created_at, updated_at, label_id)
             VALUES ('session-1', ?1, ?1, 'Completed', 1000, 1000, ?1, ?1, 1)",
            params![now],
        )?;

        run_migrations(&mut conn)?;

        let label_id: Option<i64> = conn.query_row(
            "SELECT label_id FROM sessions WHERE id = 'session-1'",
            [],
            |row| row.get(0),
        )?;
        let foreign_keys: bool = conn.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
        assert_eq!(label_id, Some(1));
        assert!(foreign_keys);
        let test_table_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'test_table')",
            [],
            |row| row.get(0),
        )?;
        let composite_index_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master
             WHERE type = 'index' AND name = 'idx_context_readings_session_timestamp')",
            [],
            |row| row.get(0),
        )?;
        let old_timestamp_index_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master
             WHERE type = 'index' AND name = 'idx_context_readings_timestamp')",
            [],
            |row| row.get(0),
        )?;
        assert!(!test_table_exists);
        assert!(composite_index_exists);
        assert!(!old_timestamp_index_exists);
        Ok(())
    }

    #[test]
    fn migration_preserves_but_does_not_reject_legacy_orphans() -> Result<()> {
        let mut conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", false)?;
        {
            let tx = conn.transaction()?;
            for version in 1..=12 {
                apply_migration(&tx, version)?;
            }
            tx.pragma_update(None, "user_version", 12)?;
            tx.execute(
                "INSERT INTO context_readings
                 (session_id, timestamp, window_id, bundle_id, window_title,
                  owner_name, bounds_json)
                 VALUES ('missing-session', '2026-08-19T12:00:00Z', 0,
                         'com.test', 'Preserved', 'Test', '{}')",
                [],
            )?;
            tx.commit()?;
        }
        conn.pragma_update(None, "foreign_keys", true)?;
        let before = foreign_key_violations(&conn)?;
        assert_eq!(before.len(), 1);

        run_migrations(&mut conn)?;

        assert_eq!(foreign_key_violations(&conn)?, before);
        let title: String = conn.query_row(
            "SELECT window_title FROM context_readings WHERE session_id = 'missing-session'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(title, "Preserved");
        Ok(())
    }
}
