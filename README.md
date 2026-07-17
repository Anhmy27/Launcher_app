# Launcher App

A desktop application launcher platform with admin portal, Go API, and Tauri client. Users browse a store, manage a personal library, and install or launch apps. Admins publish applications, manage users, and monitor which machines are online and which launcher-controlled apps are running.

## Features

- **Store & library** — browse published apps, add to library, install/update/launch from the desktop client
- **Two distribution types**
  - **Portable** — download files into a managed folder, launch local executable
  - **Installer** — download MSI/Setup, run installer, launch via absolute path after install
- **Incremental updates** — manifest + SHA-256 file comparison; only changed files are downloaded
- **Device install sync** — track which apps are installed on which device (`device_app_status`)
- **Presence monitoring** — track who is signed in on which machine and which launcher apps are running (`devices.current_user_id` + `device_app_sessions`); client heartbeat (~45s) with PID tracking; admin Devices page auto-refreshes (~20s)
- **Admin panel** — manage apps, versions, users, and devices; light/dark theme; EN/VI locale
- **Desktop client** — Tauri + React; light/dark theme; EN/VI locale

## Architecture

| Component | Stack | Role |
|-----------|--------|------|
| `backend golang/` | Go, Gin, GORM, PostgreSQL, MinIO | REST API, auth, uploads, migrations, presence |
| `frontendnextjs/` | Next.js, React, Tailwind | Admin web dashboard |
| `launcher-tauri/` | Tauri 2, React, Vite, Rust | Desktop client (Windows) |
| `docker-compose.yml` | PostgreSQL 16, MinIO | Local infrastructure |

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Tauri Client   │────▶│   Go Backend     │────▶│   PostgreSQL    │
│  Store/Library  │     │   REST :8080     │     │   :5432         │
│  Heartbeat+PID  │     │                  │     │                 │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
┌─────────────────┐              ├──────────────▶┌─────────────────┐
│  Admin (Next)   │──────────────┘               │  MinIO :9000    │
│  Apps/Users/    │                              │  Builds/files   │
│  Devices        │                              └─────────────────┘
│  :3000          │
└─────────────────┘
```

### Library vs device install vs presence

| Concept | Storage | Meaning |
|---------|---------|---------|
| Library | `user_apps` | User bookmarked the app (not necessarily installed) |
| On this device | Local files + `device_app_status` | App is installed on this machine |
| Online / running | `devices` + `device_app_sessions` | Who is signed in; which apps are currently running (open sessions have `ended_at IS NULL`) |

Portable and installer installs live under:

```text
%LOCALAPPDATA%\LauncherApps\{app-slug}\
  ├── manifest.json
  └── install-state.json   # installer type
```

The client does not scan the disk; it resolves install status by known path + slug.

### Presence flow (no WebSocket)

1. On login, client registers/updates the device and sets `current_user_id`.
2. While the launcher is open, client sends `POST /devices/:id/heartbeat` about every 45s with `active_apps` (app id + PID).
3. Backend reconciles `device_app_sessions` (open / refresh / close).
4. A device is **online** if `last_seen` is within ~2 minutes.
5. On logout, client calls `POST /devices/:id/logout` (clear user + close sessions). Closing the window without logout relies on heartbeat timeout.
6. Admin Devices page polls `GET /devices` about every 20s.

## Prerequisites

- Docker / Docker Compose
- Go **1.25+**
- Node.js **20+**
- Rust toolchain (for Tauri desktop builds)
- [golang-migrate](https://github.com/golang-migrate/migrate) CLI (optional; backend also migrates on startup)

## Getting started

### 1. Infrastructure

```bash
docker compose up -d
```

| Service | URL / port | Credentials |
|---------|------------|-------------|
| PostgreSQL | `localhost:5432` | `launcher` / `launcher123` / DB `launcher_app` |
| MinIO API | http://localhost:9000 | `admin` / `12345678` |
| MinIO Console | http://localhost:9001 | same |

### 2. Backend API

```bash
cd "backend golang"
# Configure .env (see existing .env for keys: DB_*, MINIO_*, JWT_*, SERVER_PORT)
go run .
```

API: http://localhost:8080  

Migrations run automatically on startup. Current schema version: **19**.  
Details: [`backend golang/migrations/README.md`](backend%20golang/migrations/README.md).

At the company, the backend may run in Docker with the local `backend golang/` folder mounted and `go run .` so a container restart picks up code and migrations.

### 3. Admin panel

```bash
cd frontendnextjs
npm install
npm run dev
```

Open http://localhost:3000  

Admin sections: Overview, Apps, **Devices**, Users.

### 4. Desktop client

```bash
cd launcher-tauri
npm install
npm run tauri dev
```

Point the client API base URL at `http://localhost:8080` (see client env / config as used in the project).

## Default admin

| Field | Value |
|-------|--------|
| Email | `admin@launcher.com` |
| Password | `admin123` |

Seeded by migration `000006` on a fresh database.

## Project structure

```text
Launcher_app/
├── backend golang/          # Go API
│   ├── handlers/
│   ├── models/
│   ├── migrations/          # SQL migrations (v1–v19)
│   ├── services/            # MinIO, etc.
│   └── main.go
├── frontendnextjs/          # Admin (Next.js) — apps, users, devices
├── launcher-tauri/          # Desktop client (Tauri) — store, library, presence
└── docker-compose.yml       # Postgres + MinIO
```

## Distribution workflow (client)

1. **Store** — add app to library only (bookmark).
2. **Library**
   - Portable → **Install** / **Launch** / **Update**
   - Installer → **Run installer** / **Launch** (absolute `installer_launch_path`)
3. On **Launch**, client records the process PID and reports it on the next heartbeat.
4. **Remove from device** — uninstall/clear local state; library entry can remain.
5. **Remove from library** — drop bookmark; does not always delete local files (see client prompts).

## API smoke tests

```bash
# Register
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@test.com\",\"password\":\"password123\",\"full_name\":\"Test User\"}"

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@launcher.com\",\"password\":\"admin123\"}"
```

Presence-related endpoints (auth required; admin devices need admin role):

- `POST /api/devices/register` — register/update device + `current_user_id`
- `POST /api/devices/:id/heartbeat` — body may include `active_apps`
- `POST /api/devices/:id/logout` — clear user and close open sessions
- `GET /api/devices` — admin list with online status and running apps
- `GET /api/devices/:id` — admin device detail

## Migrations (manual)

```bash
migrate -path "backend golang/migrations" \
  -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" up

migrate -path "backend golang/migrations" \
  -database "postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable" version
```

## License

Private / internal project — update this section if you publish the repository.
