ALTER TABLE app_versions
  DROP COLUMN IF EXISTS installer_product_code,
  DROP COLUMN IF EXISTS installer_uninstall_path,
  DROP COLUMN IF EXISTS installer_uninstall_args;
