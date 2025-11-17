-- Migration to version 10: Add labels system for categorizing sessions

-- Create labels table
CREATE TABLE labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT DEFAULT NULL
);

-- Create indexes for labels
CREATE INDEX idx_labels_deleted_at ON labels(deleted_at);
CREATE INDEX idx_labels_order_index ON labels(order_index);

-- Add label_id column to sessions table
ALTER TABLE sessions ADD COLUMN label_id INTEGER REFERENCES labels(id) ON DELETE SET NULL;

-- Create index for sessions label lookups
CREATE INDEX idx_sessions_label_id ON sessions(label_id);
