# Launcher App - Quick Start Guide

## 🚀 Setup & Run

### 1. Start Database

```bash
docker-compose up -d
```

### 2. Run Migrations (Automatic on server start)

Backend tự động chạy migrations khi start. Hoặc chạy thủ công:

```bash
# Windows PowerShell
migrate -path "backend golang/migrations" -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" up
```

### 3. Start Backend

```bash
cd "backend golang"
go run .
```

Server chạy tại: `http://localhost:8080`

---

## 📁 Migration Files

Tất cả SQL migrations ở: `backend golang/migrations/`

```
000001_create_users_table.up.sql
000002_create_applications_table.up.sql
000003_create_app_versions_table.up.sql
000004_create_user_apps_table.up.sql
000005_create_downloads_table.up.sql
000006_empty.up.sql
000007_create_devices_tables.up.sql
000008_add_registry_name.up.sql
000009_remove_version_from_user_apps.up.sql
000010_refactor_device_app_status.up.sql
000011_replace_mac_with_machine_id.up.sql
000012_rename_download_url_to_manifest_url.up.sql
000013_drop_registry_name_from_applications.up.sql
```

Current schema version: `13`

---

## 🔐 Default Admin

- **Email:** `admin@launcher.com`
- **Password:** `admin123`

---

## 📋 Migration Commands

```bash
# Migrate up
migrate -path "backend golang/migrations" -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" up

# Rollback 1 migration
migrate -path "backend golang/migrations" -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" down 1

# Check version
migrate -path "backend golang/migrations" -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" version

# Create new migration
migrate create -ext sql -dir "backend golang/migrations" -seq migration_name
```

---

## 🗂️ Project Structure

```
backend golang/
├── migrations/          ← SQL migration files
├── config/              ← Configuration
├── database/            ← Database connection & migrate runner
├── models/              ← GORM models
├── handlers/            ← HTTP handlers
├── middleware/          ← Auth middleware
├── routes/              ← API routes
├── utils/               ← Helper functions
└── main.go              ← Entry point
```

---

## 🧪 Test API

### Register

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password123","full_name":"Test User"}'
```

### Login

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@launcher.com","password":"admin123"}'
```
