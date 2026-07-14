# Database Migrations

## Setup

Install golang-migrate CLI:

### Windows (PowerShell)

```powershell
# Using scoop
scoop install migrate

# Or download binary from: https://github.com/golang-migrate/migrate/releases
```

### Manual Commands

```bash
# Run all migrations
migrate -path migrations -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" up

# Rollback last migration
migrate -path migrations -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" down 1

# Rollback all migrations
migrate -path migrations -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" down

# Check current version
migrate -path migrations -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" version

# Force version (if dirty)
migrate -path migrations -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" force VERSION
```

## Create New Migration

```bash
migrate create -ext sql -dir migrations -seq migration_name
```

## Migration Files

- `000001_create_users_table.up.sql` / `.down.sql`
- `000002_create_applications_table.up.sql` / `.down.sql`
- `000003_create_app_versions_table.up.sql` / `.down.sql`
- `000004_create_user_apps_table.up.sql` / `.down.sql`
- `000005_create_downloads_table.up.sql` / `.down.sql`
- `000006_empty.up.sql` / `.down.sql` (seed default admin user)
- `000007_create_devices_tables.up.sql` / `.down.sql`
- `000008_add_registry_name.up.sql` / `.down.sql`
- `000009_remove_version_from_user_apps.up.sql` / `.down.sql`
- `000010_refactor_device_app_status.up.sql` / `.down.sql`
- `000011_replace_mac_with_machine_id.up.sql` / `.down.sql`
- `000012_rename_download_url_to_manifest_url.up.sql` / `.down.sql`
- `000013_drop_registry_name_from_applications.up.sql` / `.down.sql`
- `000014_add_progress_detail_to_downloads.up.sql` / `.down.sql`
- `000015_add_distribution_fields_to_app_versions.up.sql` / `.down.sql`
- `000016_add_installer_uninstall_fields.up.sql` / `.down.sql`
- `000017_unique_app_version_code.up.sql` / `.down.sql`
- `000018_drop_url_distribution.up.sql` / `.down.sql`

Current schema version: `18`

## Default Admin

- Email: `admin@launcher.com`
- Password: `admin123`
