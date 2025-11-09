-- Migration to version 7: Add apps table for metadata, icons, and aggregated stats

-- Create apps table
CREATE TABLE apps (
    -- Primary key
    id TEXT PRIMARY KEY,

    -- App identity
    bundle_id TEXT NOT NULL UNIQUE,
    app_name TEXT,

    -- Icon storage (base64 PNG data URL)
    icon_data_url TEXT,
    icon_fetched_at TEXT,

    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Index for bundle_id lookups
CREATE INDEX idx_apps_bundle_id ON apps(bundle_id);

-- Backfill apps table from existing segments
INSERT INTO apps (
    id,
    bundle_id,
    app_name,
    created_at,
    updated_at
)
SELECT
    lower(hex(randomblob(16))) as id,
    bundle_id,
    MAX(app_name) as app_name,
    datetime('now') as created_at,
    datetime('now') as updated_at
FROM segments
GROUP BY bundle_id;
