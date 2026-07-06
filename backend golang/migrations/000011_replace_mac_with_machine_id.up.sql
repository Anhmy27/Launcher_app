-- Replace mac_address with machine_id (Windows Machine GUID) for unique device identification
-- Drop old unique index and column index on mac_address
DROP INDEX IF EXISTS idx_devices_mac;

-- Add machine_id column
ALTER TABLE devices ADD COLUMN IF NOT EXISTS machine_id VARCHAR(100);

-- Copy mac_address values to machine_id as fallback for existing records
UPDATE devices SET machine_id = mac_address WHERE machine_id IS NULL OR machine_id = '';

-- Create unique index on machine_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_machine_id ON devices(machine_id);

-- Drop old mac_address column
ALTER TABLE devices DROP COLUMN IF EXISTS mac_address;
