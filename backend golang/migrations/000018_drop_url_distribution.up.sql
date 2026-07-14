-- Remove URL distribution support: cleanup rows and drop launch_url.

UPDATE app_versions
SET
  is_released = false,
  distribution_type = 'portable',
  release_date = NULL
WHERE distribution_type = 'url';

ALTER TABLE app_versions DROP COLUMN IF EXISTS launch_url;
