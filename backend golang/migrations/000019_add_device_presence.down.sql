DROP TABLE IF EXISTS device_app_sessions;

ALTER TABLE devices DROP CONSTRAINT IF EXISTS fk_devices_current_user;
DROP INDEX IF EXISTS idx_devices_current_user;
ALTER TABLE devices DROP COLUMN IF EXISTS current_user_id;
