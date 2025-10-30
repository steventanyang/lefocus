-- Migration to version 5: create segments and interruptions tables for segmentation.

-- Segments table
CREATE TABLE segments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,

    -- Time bounds
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_secs INTEGER NOT NULL,

    -- Primary identity
    bundle_id TEXT NOT NULL,
    app_name TEXT,
    window_title TEXT,  -- Most common window title in this segment

    -- Segment classification
    segment_type TEXT NOT NULL,  -- 'stable', 'transitioning', 'distracted'

    -- Confidence scoring (0.0 to 1.0)
    confidence REAL NOT NULL,
    duration_score REAL,
    stability_score REAL,
    visual_clarity_score REAL,
    ocr_quality_score REAL,

    -- Stats
    reading_count INTEGER NOT NULL,
    unique_phash_count INTEGER,

    -- Future P1: LLM-generated summary
    segment_summary TEXT,

    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_segments_session ON segments(session_id, start_time);
CREATE INDEX idx_segments_type ON segments(segment_type);

-- Interruptions table (brief switches within stable segments)
CREATE TABLE interruptions (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,

    bundle_id TEXT NOT NULL,
    app_name TEXT,

    timestamp TEXT NOT NULL,
    duration_secs INTEGER NOT NULL,

    FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
);

CREATE INDEX idx_interruptions_segment ON interruptions(segment_id, timestamp);

