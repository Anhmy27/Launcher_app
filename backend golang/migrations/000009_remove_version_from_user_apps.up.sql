-- Remove installed_version_id from user_apps (version tracking moves to device_app_status)
ALTER TABLE user_apps DROP COLUMN IF EXISTS installed_version_id;
