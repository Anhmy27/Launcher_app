-- Rollback distribution fields
DROP INDEX IF EXISTS idx_app_versions_distribution_type;

ALTER TABLE app_versions
  DROP COLUMN IF EXISTS distribution_type,
  DROP COLUMN IF EXISTS launch_url,
  DROP COLUMN IF EXISTS installer_kind,
  DROP COLUMN IF EXISTS installer_silent_args,
  DROP COLUMN IF EXISTS installer_launch_path;

