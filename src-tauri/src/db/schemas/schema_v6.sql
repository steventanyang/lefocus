-- Migration to version 6: Remove segment_type column (simplification - no more transitioning/distracted types)

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Step 1: Create new segments table without segment_type
CREATE TABLE segments_new (
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

-- Step 2: Copy data from old table (excluding segment_type)
INSERT INTO segments_new (
    id,
    session_id,
    start_time,
    end_time,
    duration_secs,
    bundle_id,
    app_name,
    window_title,
    confidence,
    duration_score,
    stability_score,
    visual_clarity_score,
    ocr_quality_score,
    reading_count,
    unique_phash_count,
    segment_summary
)
SELECT
    id,
    session_id,
    start_time,
    end_time,
    duration_secs,
    bundle_id,
    app_name,
    window_title,
    confidence,
    duration_score,
    stability_score,
    visual_clarity_score,
    ocr_quality_score,
    reading_count,
    unique_phash_count,
    segment_summary
FROM segments;

-- Step 3: Drop old table
DROP TABLE segments;

-- Step 4: Rename new table
ALTER TABLE segments_new RENAME TO segments;

-- Step 5: Recreate index (without segment_type index)
CREATE INDEX idx_segments_session ON segments(session_id, start_time);
