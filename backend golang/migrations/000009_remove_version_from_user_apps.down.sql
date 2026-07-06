-- Re-add installed_version_id to user_apps
ALTER TABLE user_apps ADD COLUMN IF NOT EXISTS installed_version_id UUID REFERENCES app_versions(id);
