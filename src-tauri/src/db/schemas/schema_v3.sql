-- Migration to version 3: add test table for validation

CREATE TABLE test_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notes TEXT
);
