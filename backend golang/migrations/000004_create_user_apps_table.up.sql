-- Create user_apps table
CREATE TABLE IF NOT EXISTS user_apps (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    app_id UUID NOT NULL,
    installed_version_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_apps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_apps_app FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_apps_version FOREIGN KEY (installed_version_id) REFERENCES app_versions(id) ON DELETE SET NULL,
    CONSTRAINT unique_user_app UNIQUE (user_id, app_id)
);

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_user_apps_user_id ON user_apps(user_id);

-- Create index on app_id
CREATE INDEX IF NOT EXISTS idx_user_apps_app_id ON user_apps(app_id);
