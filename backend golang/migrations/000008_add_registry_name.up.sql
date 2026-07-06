-- Add registry_name column to applications table
-- This stores the name as it appears in Windows Registry (for install detection)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS registry_name VARCHAR(255) DEFAULT '';
