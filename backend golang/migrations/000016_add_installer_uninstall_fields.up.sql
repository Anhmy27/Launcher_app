ALTER TABLE app_versions
  ADD COLUMN IF NOT EXISTS installer_product_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS installer_uninstall_path VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS installer_uninstall_args VARCHAR(1000);
