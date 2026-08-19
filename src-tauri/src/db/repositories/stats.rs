use std::collections::BTreeMap;

use anyhow::{Context, Result};
use chrono::{DateTime, Local, Utc};
use rusqlite::params;

use crate::db::{
    connection::Database,
    helpers::parse_datetime,
    models::{AppSessionUsage, DailyActivity, StatsApp, StatsRange},
};

impl Database {
    pub async fn get_app_sessions_in_range(
        &self,
        bundle_id: &str,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        label_id: Option<i64>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<AppSessionUsage>> {
        let bundle_id = bundle_id.to_string();
        let limit = i64::try_from(limit).context("app session page limit is too large")?;
        let offset = i64::try_from(offset).context("app session page offset is too large")?;
        self.execute(move |conn| {
            let mut statement = conn.prepare(
                "WITH app_usage AS (
                    SELECT segments.session_id,
                           SUM(segments.duration_secs) AS app_duration_secs
                    FROM segments INDEXED BY idx_segments_start_time
                    INNER JOIN sessions ON sessions.id = segments.session_id
                    WHERE segments.bundle_id = ?1
                      AND segments.start_time >= ?2
                      AND segments.start_time <= ?3
                      AND sessions.status IN ('Completed', 'Interrupted')
                      AND (?4 IS NULL OR sessions.label_id = ?4)
                    GROUP BY segments.session_id
                 )
                 SELECT sessions.id,
                        sessions.started_at,
                        sessions.stopped_at,
                        sessions.status,
                        app_usage.app_duration_secs,
                        COALESCE((
                            SELECT SUM(all_segments.duration_secs)
                            FROM segments AS all_segments
                            WHERE all_segments.session_id = sessions.id
                        ), 0) AS session_duration_secs
                 FROM app_usage
                 INNER JOIN sessions ON sessions.id = app_usage.session_id
                 ORDER BY sessions.started_at DESC, sessions.id DESC
                 LIMIT ?5 OFFSET ?6",
            )?;
            let rows = statement.query_map(
                params![
                    bundle_id,
                    start_time.to_rfc3339(),
                    end_time.to_rfc3339(),
                    label_id,
                    limit,
                    offset,
                ],
                |row| {
                    Ok(AppSessionUsage {
                        session_id: row.get(0)?,
                        started_at: row.get(1)?,
                        stopped_at: row.get(2)?,
                        status: row.get(3)?,
                        app_duration_secs: row.get(4)?,
                        session_duration_secs: row.get(5)?,
                    })
                },
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(Into::into)
        })
        .await
    }

    /// Return the aggregate data needed by the stats list and treemap.
    pub async fn get_stats_in_range(
        &self,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        label_id: Option<i64>,
    ) -> Result<StatsRange> {
        self.execute(move |conn| {
            let start = start_time.to_rfc3339();
            let end = end_time.to_rfc3339();
            let (total_duration_secs, segment_count) = conn.query_row(
                "SELECT COALESCE(SUM(segments.duration_secs), 0), COUNT(*)
                 FROM segments INDEXED BY idx_segments_start_time
                 INNER JOIN sessions ON sessions.id = segments.session_id
                 WHERE segments.start_time >= ?1
                   AND segments.start_time <= ?2
                   AND sessions.status IN ('Completed', 'Interrupted')
                   AND (?3 IS NULL OR sessions.label_id = ?3)",
                params![&start, &end, label_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;

            let mut stmt = conn.prepare(
                "SELECT
                    segments.bundle_id,
                    MAX(segments.app_name) AS app_name,
                    SUM(segments.duration_secs) AS duration_secs,
                    apps.icon_data_url,
                    apps.icon_color
                 FROM segments INDEXED BY idx_segments_start_time
                 INNER JOIN sessions ON sessions.id = segments.session_id
                 LEFT JOIN apps ON apps.bundle_id = segments.bundle_id
                 WHERE segments.start_time >= ?1
                   AND segments.start_time <= ?2
                   AND sessions.status IN ('Completed', 'Interrupted')
                   AND (?3 IS NULL OR sessions.label_id = ?3)
                 GROUP BY segments.bundle_id, apps.icon_data_url, apps.icon_color
                 ORDER BY duration_secs DESC",
            )?;

            let rows = stmt.query_map(params![start, end, label_id], |row| {
                Ok(StatsApp {
                    bundle_id: row.get(0)?,
                    app_name: row.get(1)?,
                    duration_secs: row.get(2)?,
                    icon_data_url: row.get(3)?,
                    icon_color: row.get(4)?,
                })
            })?;

            let apps = rows.collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(StatsRange {
                total_duration_secs,
                segment_count,
                apps,
            })
        })
        .await
    }

    /// Aggregate segment durations into local calendar days for the activity heatmap.
    pub async fn get_daily_activity_in_range(
        &self,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        label_id: Option<i64>,
    ) -> Result<Vec<DailyActivity>> {
        self.execute(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT segments.start_time, segments.duration_secs
                 FROM segments INDEXED BY idx_segments_start_time
                 INNER JOIN sessions ON sessions.id = segments.session_id
                 WHERE segments.start_time >= ?1
                   AND segments.start_time <= ?2
                   AND sessions.status IN ('Completed', 'Interrupted')
                   AND (?3 IS NULL OR sessions.label_id = ?3)
                 ORDER BY segments.start_time ASC",
            )?;

            let rows = stmt.query_map(
                params![start_time.to_rfc3339(), end_time.to_rfc3339(), label_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )?;

            let mut totals = BTreeMap::<String, i64>::new();
            for row in rows {
                let (timestamp, duration_secs) = row?;
                let timestamp = parse_datetime(&timestamp, "start_time")?;
                let date = timestamp
                    .with_timezone(&Local)
                    .format("%Y-%m-%d")
                    .to_string();
                *totals.entry(date).or_default() += duration_secs;
            }

            Ok(totals
                .into_iter()
                .map(|(date, duration_secs)| DailyActivity {
                    date,
                    duration_secs,
                })
                .collect())
        })
        .await
    }
}
