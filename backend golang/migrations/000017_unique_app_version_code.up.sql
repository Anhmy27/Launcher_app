CREATE UNIQUE INDEX IF NOT EXISTS idx_app_versions_app_id_version_code
  ON app_versions(app_id, version_code);
