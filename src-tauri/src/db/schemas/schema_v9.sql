-- Migration to version 9: Add segment_id to context_readings table

-- Add segment_id column to link readings to segments
ALTER TABLE context_readings ADD COLUMN segment_id TEXT;

-- Add foreign key constraint
-- Note: SQLite doesn't support ADD CONSTRAINT, so we'll create it via a trigger or handle in application code
-- Foreign key: segment_id REFERENCES segments(id) ON DELETE SET NULL

-- Add index for efficient segment queries
CREATE INDEX idx_context_readings_segment_id ON context_readings(segment_id);

