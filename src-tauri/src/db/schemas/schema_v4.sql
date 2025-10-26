-- Migration to version 4: create context_readings table for sensing pipeline.

CREATE TABLE context_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    window_id INTEGER NOT NULL,
    bundle_id TEXT NOT NULL,
    window_title TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    bounds_json TEXT NOT NULL,
    phash TEXT,
    ocr_text TEXT,
    ocr_confidence REAL,
    ocr_word_count INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_context_readings_session_id ON context_readings(session_id);
CREATE INDEX idx_context_readings_timestamp ON context_readings(timestamp);
