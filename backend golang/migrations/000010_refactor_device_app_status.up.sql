-- Refactor device_app_status: use version_code (int) instead of version string
-- Add new columns
ALTER TABLE device_app_status ADD COLUMN IF NOT EXISTS installed_version_code BIGINT NOT NULL DEFAULT 0;
ALTER TABLE device_app_status ADD COLUMN IF NOT EXISTS installed_version_name VARCHAR(50) DEFAULT '';

-- Drop old columns (if they exist)
ALTER TABLE device_app_status DROP COLUMN IF EXISTS installed_version;
ALTER TABLE device_app_status DROP COLUMN IF EXISTS is_installed;
ALTER TABLE device_app_status DROP COLUMN IF EXISTS needs_update;
