-- Session segmentation reads filter and order by these columns together.
DROP INDEX IF EXISTS idx_context_readings_session_id;
DROP INDEX IF EXISTS idx_context_readings_timestamp;
CREATE INDEX idx_context_readings_session_timestamp
    ON context_readings(session_id, timestamp);

-- schema_v3 created this only as a migration validation artifact.
DROP TABLE IF EXISTS test_table;

CREATE TABLE activity_runs (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_secs INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    bundle_id TEXT NOT NULL,
    app_name TEXT,
    window_title TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_activity_runs_session_time
    ON activity_runs(session_id, start_time);
CREATE INDEX idx_activity_runs_bundle_time
    ON activity_runs(bundle_id, start_time);

CREATE TABLE session_reading_archives (
    session_id TEXT PRIMARY KEY,
    format_version INTEGER NOT NULL,
    reading_count INTEGER NOT NULL,
    uncompressed_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    compressed_data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE storage_maintenance (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO storage_maintenance (key, value)
VALUES ('legacy_archive_cutoff', strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'));
INSERT INTO storage_maintenance (key, value)
VALUES ('legacy_vacuum_pending', '0');
INSERT INTO storage_maintenance (key, value)
VALUES ('legacy_vacuum_done', '0');
