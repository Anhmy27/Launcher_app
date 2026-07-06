-- Create downloads table
CREATE TABLE IF NOT EXISTS downloads (
    id UUID PRIMARY KEY,
    user_id UUID,
    app_version_id UUID NOT NULL,
    downloaded_size BIGINT NOT NULL DEFAULT 0,
    download_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    ip_address VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_downloads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_downloads_version FOREIGN KEY (app_version_id) REFERENCES app_versions(id) ON DELETE CASCADE
);

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON downloads(user_id);

-- Create index on app_version_id
CREATE INDEX IF NOT EXISTS idx_downloads_version_id ON downloads(app_version_id);

-- Create index on download_status
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(download_status);

-- Create index on started_at for analytics
CREATE INDEX IF NOT EXISTS idx_downloads_started_at ON downloads(started_at);
