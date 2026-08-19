use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsApp {
    pub bundle_id: String,
    pub app_name: Option<String>,
    pub duration_secs: i64,
    pub icon_data_url: Option<String>,
    pub icon_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsRange {
    pub total_duration_secs: i64,
    pub segment_count: i64,
    pub apps: Vec<StatsApp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivity {
    /// Local calendar date in YYYY-MM-DD format.
    pub date: String,
    pub duration_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSessionUsage {
    pub session_id: String,
    pub started_at: String,
    pub stopped_at: Option<String>,
    pub status: String,
    pub app_duration_secs: i64,
    pub session_duration_secs: i64,
}
