use anyhow::{bail, Context, Result};
use rusqlite::{Connection, Transaction};

const CURRENT_SCHEMA_VERSION: i32 = 12;

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
        {
            let mut check = tx
                .prepare("PRAGMA foreign_key_check")
                .context("failed to prepare foreign key validation")?;
            if check
                .exists([])
                .context("failed to validate migrated foreign keys")?
            {
                bail!("migration produced foreign key violations");
            }
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
    }
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
        Ok(())
    }
}
