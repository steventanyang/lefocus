-- Migration to version 11: Fix UNIQUE constraint on labels.name to allow reusing deleted label names
-- SQLite doesn't support modifying constraints, so we need to recreate the table

-- Step 1: Create new labels table with partial unique index
CREATE TABLE labels_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT DEFAULT NULL
);

-- Step 2: Copy data from old table
INSERT INTO labels_new (id, name, color, order_index, created_at, updated_at, deleted_at)
SELECT id, name, color, order_index, created_at, updated_at, deleted_at
FROM labels;

-- Step 3: Drop old table
DROP TABLE labels;

-- Step 4: Rename new table
ALTER TABLE labels_new RENAME TO labels;

-- Step 5: Recreate indexes
CREATE INDEX idx_labels_deleted_at ON labels(deleted_at);
CREATE INDEX idx_labels_order_index ON labels(order_index);

-- Step 6: Create partial unique index - only enforce uniqueness for non-deleted labels
-- This allows reusing label names after deletion
CREATE UNIQUE INDEX idx_labels_unique_name ON labels(name) WHERE deleted_at IS NULL;
