-- Presence tracking: which user is on a device and which launcher apps are running.

-- 1. Track the currently logged-in user on each device.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS current_user_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_devices_current_user'
    ) THEN
        ALTER TABLE devices
            ADD CONSTRAINT fk_devices_current_user
            FOREIGN KEY (current_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_devices_current_user ON devices(current_user_id);

-- 2. Track running launcher-controlled apps per device (multiple concurrent apps).
CREATE TABLE IF NOT EXISTS device_app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    app_id UUID NOT NULL,
    user_id UUID,
    pid INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_session_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_app FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_device_app_sessions_device ON device_app_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_app_sessions_app ON device_app_sessions(app_id);
-- Fast lookup of still-running sessions.
CREATE INDEX IF NOT EXISTS idx_device_app_sessions_open
    ON device_app_sessions(device_id) WHERE ended_at IS NULL;
