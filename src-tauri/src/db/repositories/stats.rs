use std::collections::BTreeMap;

use anyhow::Result;
use chrono::{DateTime, Local, Utc};
use rusqlite::params;

use crate::db::{
    connection::Database,
    helpers::parse_datetime,
    models::{DailyActivity, StatsApp, StatsRange},
};

impl Database {
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
