-- Rollback: restore old columns
ALTER TABLE device_app_status ADD COLUMN IF NOT EXISTS installed_version VARCHAR(255);
ALTER TABLE device_app_status ADD COLUMN IF NOT EXISTS is_installed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE device_app_status ADD COLUMN IF NOT EXISTS needs_update BOOLEAN NOT NULL DEFAULT false;

-- Migrate data back
UPDATE device_app_status SET installed_version = installed_version_name WHERE installed_version_name IS NOT NULL AND installed_version_name != '';

-- Drop new columns
ALTER TABLE device_app_status DROP COLUMN IF EXISTS installed_version_code;
ALTER TABLE device_app_status DROP COLUMN IF EXISTS installed_version_name;
