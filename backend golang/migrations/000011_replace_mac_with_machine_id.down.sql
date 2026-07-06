-- Rollback: restore mac_address column from machine_id
DROP INDEX IF EXISTS idx_devices_machine_id;

ALTER TABLE devices ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17);

UPDATE devices SET mac_address = machine_id WHERE mac_address IS NULL OR mac_address = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac_address);

ALTER TABLE devices DROP COLUMN IF EXISTS machine_id;
