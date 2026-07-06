-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_name VARCHAR(255) NOT NULL,
    hostname VARCHAR(255),
    mac_address VARCHAR(17) UNIQUE,
    ip_address VARCHAR(50),
    last_seen TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create device_app_status table
CREATE TABLE IF NOT EXISTS device_app_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    app_id UUID NOT NULL,
    installed_version VARCHAR(255),
    is_installed BOOLEAN NOT NULL DEFAULT true,
    last_checked TIMESTAMP,
    needs_update BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    CONSTRAINT fk_app FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT unique_device_app UNIQUE(device_id, app_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac_address);
CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address);
CREATE INDEX IF NOT EXISTS idx_device_app_status_device ON device_app_status(device_id);
CREATE INDEX IF NOT EXISTS idx_device_app_status_app ON device_app_status(app_id);
