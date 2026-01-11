-- Migration to version 12: Add note column to sessions table
ALTER TABLE sessions ADD COLUMN note TEXT DEFAULT NULL;
