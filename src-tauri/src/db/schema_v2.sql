-- Migration to version 2: remove pause support.

-- 1. Create replacement sessions table without paused_ms column and without the "Paused" status.
CREATE TABLE sessions_new (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    stopped_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('Running', 'Completed', 'Cancelled', 'Interrupted')),
    target_ms INTEGER NOT NULL,
    active_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. Copy existing rows, coercing any Paused entries to Interrupted so they pass the new constraint.
INSERT INTO sessions_new (id, started_at, stopped_at, status, target_ms, active_ms, created_at, updated_at)
SELECT
    id,
    started_at,
    stopped_at,
    CASE WHEN status = 'Paused' THEN 'Interrupted' ELSE status END AS status,
    target_ms,
    active_ms,
    created_at,
    updated_at
FROM sessions;

-- 3. Drop old sessions table and swap in the new structure.
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

-- 4. Recreate indexes.
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_started_at ON sessions(started_at DESC);

-- 5. Drop pauses table (no longer used).
DROP TABLE IF EXISTS pauses;
