use anyhow::{bail, Context, Result};
use rusqlite::{Connection, Transaction};

const CURRENT_SCHEMA_VERSION: i32 = 11;

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
    tx.commit().context("failed to commit migrations")?;

    Ok(())
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
        _ => bail!("unknown migration target version: {version}"),
    }
}
