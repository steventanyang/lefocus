use std::convert::TryFrom;

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};

use crate::db::models::SessionStatus;

pub fn to_i64(value: u64) -> Result<i64> {
    i64::try_from(value).map_err(|_| anyhow!("value {value} exceeds SQLite INTEGER range"))
}

pub fn to_u64(value: i64, field: &str) -> Result<u64> {
    u64::try_from(value).map_err(|_| anyhow!("{field} contains negative value {value}"))
}

pub fn parse_datetime(value: &str, field: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .with_context(|| format!("failed to parse {field}"))
}

pub fn parse_optional_datetime(
    value: Option<String>,
    field: &str,
) -> Result<Option<DateTime<Utc>>> {
    match value {
        Some(raw) => parse_datetime(&raw, field).map(Some),
        None => Ok(None),
    }
}

pub fn parse_status(value: &str) -> Result<SessionStatus> {
    match value {
        "Running" => Ok(SessionStatus::Running),
        "Completed" => Ok(SessionStatus::Completed),
        "Cancelled" => Ok(SessionStatus::Cancelled),
        "Interrupted" => Ok(SessionStatus::Interrupted),
        other => Err(anyhow!("unknown session status {other}")),
    }
}
