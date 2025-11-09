use crate::db::Database;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Manages pre-fetching of app icons during active sessions.
/// This helps ensure icons are ready when the session summary view loads,
/// avoiding race conditions where icons are still being fetched.
pub struct IconManager {
    db: Database,
    /// Track bundle IDs we've already processed in this session to avoid duplicates
    seen_bundles: Arc<Mutex<HashSet<String>>>,
}

impl IconManager {
    /// Create a new IconManager instance for a session
    pub fn new(db: Database) -> Self {
        Self {
            db,
            seen_bundles: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Called when a new bundle_id is detected during window tracking.
    /// This will ensure the app exists in the database and pre-fetch its icon if needed.
    /// This is non-blocking and returns immediately.
    pub async fn ensure_icon(&self, bundle_id: &str, app_name: Option<&str>) {
        // Skip synthetic system bundle IDs that won't have icons
        if bundle_id == "com.apple.system" {
            log::trace!("Skipping icon prefetch for synthetic bundle ID: {}", bundle_id);
            return;
        }

        // Check if we've already processed this bundle in this session
        if !self.should_process(bundle_id).await {
            return;
        }

        // Clone what we need for the async task
        let bundle_id = bundle_id.to_string();
        let app_name = app_name.map(String::from);
        let db = self.db.clone();

        // Spawn a task to handle the icon fetching without blocking
        tokio::spawn(async move {
            if let Err(e) = prefetch_icon_for_app(db, &bundle_id, app_name.as_deref()).await {
                log::debug!("Icon prefetch task failed for {}: {}", bundle_id, e);
            }
        });
    }

    /// Check if we should process this bundle_id.
    /// Returns true if this is the first time seeing this bundle in this session.
    async fn should_process(&self, bundle_id: &str) -> bool {
        let mut seen = self.seen_bundles.lock().await;

        // If we've seen it before, skip it
        if seen.contains(bundle_id) {
            return false;
        }

        // Mark as seen and return true to process it
        seen.insert(bundle_id.to_string());
        true
    }

    /// Clear the seen bundles set when starting a new session
    pub async fn clear(&self) {
        let mut seen = self.seen_bundles.lock().await;
        seen.clear();
        log::debug!("Cleared icon manager cache for new session");
    }
}

/// Helper function to handle the actual icon prefetching logic
async fn prefetch_icon_for_app(
    db: Database,
    bundle_id: &str,
    app_name: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    // First, ensure the app exists in the database
    db.ensure_app_exists(bundle_id, app_name).await?;

    // Check if the app already has an icon
    let has_icon = db.app_has_icon(bundle_id).await?;

    if has_icon {
        log::trace!("App {} already has icon, skipping prefetch", bundle_id);
        return Ok(());
    }

    // Fetch the icon using the existing bridge
    log::debug!("Pre-fetching icon for {} during session", bundle_id);

    match crate::macos_bridge::get_app_icon_data(bundle_id) {
        Some(icon_data_url) => {
            // Store the icon in the database
            if let Err(e) = db.update_app_icon(bundle_id, &icon_data_url).await {
                log::warn!("Failed to store prefetched icon for {}: {}", bundle_id, e);
            } else {
                log::info!("Successfully prefetched icon for {}", bundle_id);
            }
        }
        None => {
            // Don't log as warning during prefetch - this is expected for some apps
            log::debug!("Could not prefetch icon for {} (app might not be installed)", bundle_id);
        }
    }

    Ok(())
}