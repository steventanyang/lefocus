-- Migration to version 7: App Configs and Custom Logos feature
-- See system design: phase-5-app-configs.md

-- Create app_configs table
CREATE TABLE app_configs (
    id TEXT PRIMARY KEY,
    bundle_id TEXT NOT NULL UNIQUE,
    app_name TEXT,
    logo_data TEXT,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_app_configs_bundle_id ON app_configs(bundle_id);
CREATE INDEX idx_app_configs_updated ON app_configs(updated_at);

-- Create index on context_readings.bundle_id for get_all_detected_apps performance
CREATE INDEX IF NOT EXISTS idx_context_readings_bundle_id ON context_readings(bundle_id);

-- Seed database with one example app color (Chrome)
INSERT INTO app_configs (id, bundle_id, app_name, color, created_at, updated_at) VALUES
('ac_chrome', 'com.google.Chrome', 'Chrome', '#7A8C9E', datetime('now'), datetime('now'));
