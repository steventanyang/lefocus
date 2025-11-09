use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct App {
    pub id: String,
    pub bundle_id: String,
    pub app_name: Option<String>,
    pub icon_data_url: Option<String>,
    pub icon_fetched_at: Option<DateTime<Utc>>,
}
