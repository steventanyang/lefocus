CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    stopped_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('Running', 'Paused', 'Completed', 'Cancelled', 'Interrupted')),
    target_ms INTEGER NOT NULL,
    active_ms INTEGER NOT NULL DEFAULT 0,
    paused_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_started_at ON sessions(started_at DESC);

CREATE TABLE pauses (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    pause_started_at TEXT NOT NULL,
    pause_ended_at TEXT,
    duration_ms INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_pauses_session ON pauses(session_id);
