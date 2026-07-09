-- Add distribution fields for portable/installer/url releases
ALTER TABLE app_versions
  ADD COLUMN IF NOT EXISTS distribution_type VARCHAR(20) NOT NULL DEFAULT 'portable',
  ADD COLUMN IF NOT EXISTS launch_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS installer_kind VARCHAR(20),
  ADD COLUMN IF NOT EXISTS installer_silent_args VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS installer_launch_path VARCHAR(1000);

CREATE INDEX IF NOT EXISTS idx_app_versions_distribution_type ON app_versions(distribution_type);
