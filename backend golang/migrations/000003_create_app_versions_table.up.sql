-- Create app_versions table
CREATE TABLE IF NOT EXISTS app_versions (
    id UUID PRIMARY KEY,
    app_id UUID NOT NULL,
    version_name VARCHAR(50) NOT NULL,
    version_code BIGINT NOT NULL,
    description TEXT,
    file_size BIGINT NOT NULL DEFAULT 0,
    file_hash VARCHAR(255),
    download_url VARCHAR(500),
    is_released BOOLEAN NOT NULL DEFAULT false,
    is_required BOOLEAN NOT NULL DEFAULT false,
    release_date TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_app_versions_app FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- Create index on app_id
CREATE INDEX IF NOT EXISTS idx_app_versions_app_id ON app_versions(app_id);

-- Create index on version_code for sorting
CREATE INDEX IF NOT EXISTS idx_app_versions_version_code ON app_versions(version_code);

-- Create index on is_released
CREATE INDEX IF NOT EXISTS idx_app_versions_released ON app_versions(is_released);
