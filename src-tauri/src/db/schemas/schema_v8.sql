-- Migration to version 8: Add icon_color column to apps table

-- Add icon_color column to store extracted dominant color from app icons
ALTER TABLE apps ADD COLUMN icon_color TEXT;

