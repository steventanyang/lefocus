-- Optimize stats queries that select segments directly by time range.
CREATE INDEX idx_segments_start_time ON segments(start_time);
