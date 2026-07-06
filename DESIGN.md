# App Launcher Platform - Design Document

## 1. PROJECT OVERVIEW

- **Tên dự án**: Launcher App (Kiểu Steam/Garena/Quán Net)
- **Stack Tech**:
  - Backend: Go (REST API)
  - Admin Frontend: Next.js (Web)
  - Customer Frontend: Tauri (Desktop)
- **Mục tiêu giai đoạn 1**: Hoàn thành backend + admin panel

---

## 2. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────┐
│                   Admin Dashboard (Next.js)              │
│         - Upload builds, manage apps, publishers        │
│         - View analytics, manage users                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │   Backend API (Go)        │
        │  - Auth & Authorization  │
        │  - App Management        │
        │  - Build Management      │
        │  - Download Management   │
        │  - Analytics             │
        └──────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
   ┌──────────┐              ┌──────────────┐
   │ Database │              │ File Storage │
   │  (SQL)   │              │  (Local/S3)  │
   └──────────┘              └──────────────┘
        │
        └──────────────┬──────────────┐
                       ▼              ▼
            ┌────────────────┐  ┌──────────────┐
            │ Customer App   │  │  Web Admin   │
            │   (Tauri)      │  │  (Next.js)   │
            └────────────────┘  └──────────────┘
```

---

## 3. DATABASE SCHEMA & MODELS

### 3.1 Core Entities

#### **users**

```
- id: UUID (PK)
- email: VARCHAR(255) UNIQUE
- password_hash: VARCHAR(255)
- full_name: VARCHAR(255)
- role: ENUM(admin, publisher, customer)
- is_active: BOOLEAN
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

#### **publishers** (Công ty/Developer upload apps)

```
- id: UUID (PK)
- user_id: UUID (FK) - admin hoặc publisher chủ
- name: VARCHAR(255) UNIQUE
- slug: VARCHAR(255) UNIQUE
- description: TEXT
- logo_url: VARCHAR(500)
- website: VARCHAR(500)
- verified: BOOLEAN (admin phải verify)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

#### **applications** (Các app con)

```
- id: UUID (PK)
- name: VARCHAR(255)
- slug: VARCHAR(255) UNIQUE
- description: TEXT
- icon_url: VARCHAR(500)
- banner_url: VARCHAR(500)
- category: VARCHAR(100) - (game, tool, utility, etc.)
- is_published: BOOLEAN
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

#### **app_versions** (Các phiên bản build của app)

```
- id: UUID (PK)
- app_id: UUID (FK)
- version_name: VARCHAR(50) - (1.0.0, 1.0.1, etc.)
- version_code: BIGINT - (1, 2, 3...)
- description: TEXT
- file_size: BIGINT (bytes)
- file_hash: VARCHAR(255) (SHA256 của manifest.json)
- manifest_url: VARCHAR(500)
- is_released: BOOLEAN
- release_date: TIMESTAMP NULLABLE
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

#### **user_apps** (App đã cài đặt)

```
- id: UUID (PK)
- user_id: UUID (FK)
- app_id: UUID (FK)
- installed_version_id: UUID (FK to app_versions) NULLABLE
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

#### **downloads** (Tracking downloads cho analytics)

```
- id: UUID (PK)
- user_id: UUID (FK) NULLABLE (anonymous downloads)
- app_version_id: UUID (FK)
- downloaded_size: BIGINT
- download_status: ENUM(pending, in_progress, completed, failed)
- started_at: TIMESTAMP
- completed_at: TIMESTAMP NULLABLE
- ip_address: VARCHAR(50)
- created_at: TIMESTAMP
```

---

## 4. API ENDPOINTS (Backend Go)

### 4.1 Authentication

- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/logout` - Đăng xuất
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Lấy thông tin user hiện tại

### 4.2 Applications (Admin)

- `POST /api/apps` - Tạo app (admin)
- `GET /api/apps` - Danh sách apps (public hoặc với filter)
- `GET /api/apps/:id` - Chi tiết app
- `PUT /api/apps/:id` - Cập nhật app info (admin)
- `DELETE /api/apps/:id` - Xóa app (admin)
- `GET /api/apps/:id/versions` - Danh sách versions

### 4.3 App Versions (Admin)

- `POST /api/apps/:id/versions` - Upload/tạo version mới (admin)
- `GET /api/apps/:id/versions/:versionId` - Chi tiết version
- `PUT /api/apps/:id/versions/:versionId` - Cập nhật metadata (admin)
- `DELETE /api/apps/:id/versions/:versionId` - Xóa version (admin)
- `POST /api/apps/:id/versions/:versionId/release` - Release version (admin)

### 4.4 User Apps (Customer)

- `GET /api/me/apps` - Danh sách app đã cài đặt của user
- `POST /api/me/apps/:appId/install` - Ghi nhận cài đặt
- `DELETE /api/me/apps/:appId` - Gỡ cài đặt

### 4.5 Downloads

- `POST /api/downloads/:appVersionId/start` - Bắt đầu download
- `PUT /api/downloads/:downloadId/status` - Cập nhật status download
- `GET /api/downloads/:downloadId` - Chi tiết download

---

## 5. ADMIN FEATURES (Next.js)

### 5.1 Phần Dashboard

- [ ] Overview: Total users, apps, downloads
- [ ] Statistics charts (users, downloads, apps over time)

### 5.2 Application Management

- [ ] Danh sách tất cả apps
- [ ] Filter theo category
- [ ] Cập nhật app info (name, description, icons, banners)
- [ ] Publish/Unpublish apps

### 5.3 Build Management

- [ ] Upload build files mới
- [ ] Quản lý versions
- [ ] Release/Rollback versions
- [ ] View download history & file info

### 5.4 User Management

- [ ] Danh sách users/tài khoản máy
- [ ] Ban/Unban users
- [ ] Reset password

---

## 6. CUSTOMER FEATURES (Tauri App - Phase 2)

### 6.1 Launcher Interface

- [ ] List all available apps
- [ ] Search & filter apps
- [ ] Show app details
- [ ] Download & install apps
- [ ] Launch apps

### 6.2 Library

- [ ] Installed apps
- [ ] Update management

### 6.3 Settings

- [ ] Download directory
- [ ] Account settings

---

## 7. FILE STORAGE STRATEGY

### Upload Structure:

```
Supabase Storage bucket: builds

apps/
└── {app_id}/
   └── {app_version_id}/
      ├── manifest.json
      └── files/
         ├── app.exe
         ├── data/file1.bin
         └── ...
```

### Download Strategy:

- Launcher tải `manifest_url` trước
- So sánh hash file local với hash trong manifest
- Chỉ tải các file thay đổi (differential update)
- App được lưu tại `%LOCALAPPDATA%/LauncherApps/{slug}`

---

## 8. IMPLEMENTATION PLAN

### Phase 1 - Backend Foundation (Week 1-2)

- [ ] Setup Go project structure
- [ ] Database migrations & schema
- [ ] Authentication system (JWT)
- [ ] Core models & database layer

### Phase 2 - Backend APIs (Week 2-3)

- [ ] User & Publisher endpoints
- [ ] App & Version management endpoints
- [ ] Download tracking
- [ ] Analytics endpoints

### Phase 3 - Admin Panel (Week 3-4)

- [ ] Auth UI
- [ ] Dashboard
- [ ] Publisher management UI
- [ ] App & Build management UI
- [ ] Analytics dashboard

### Phase 4 - Customer App (Week 5+)

- [ ] Tauri setup
- [ ] Launcher UI
- [ ] Download/install logic
- [ ] Library management

---

## 9. SECURITY CONSIDERATIONS

- [ ] JWT token for API authentication
- [ ] Role-based access control (RBAC)
- [ ] Input validation & sanitization
- [ ] Rate limiting
- [ ] File upload size limits
- [ ] HTTPS enforcement
- [ ] CORS configuration
- [ ] SQL injection prevention (prepared statements)

---

## 10. DEPLOYMENT

### Backend (Go)

- Docker containerization
- Single binary deployment
- Environment variables for config

### Admin (Next.js)

- Vercel / Self-hosted deployment
- Environment variables for API URLs

### Customer (Tauri)

- Desktop app for Windows/Mac/Linux
- Auto-update mechanism
- Signature verification for builds

---

## 11. DATABASE RELATIONSHIPS

```
users (1) ──→ (∞) user_apps
applications (1) ──→ (∞) app_versions
applications (1) ──→ (∞) user_apps
app_versions (1) ──→ (∞) downloads
users (1) ──→ (∞) downloads
```

---

## 12. TECH STACK DETAILS

### Backend (Go)

- **Framework**: Gin / Echo
- **Database**: PostgreSQL / MySQL
- **ORM**: GORM
- **Auth**: JWT (github.com/golang-jwt/jwt)
- **File Upload**: multipart/form-data
- **Validation**: validator.v10

### Admin (Next.js)

- **Framework**: Next.js 14+
- **UI**: React + TypeScript
- **Styling**: Tailwind CSS / Material-UI
- **State**: React Query / Zustand
- **API Client**: Axios / Fetch
- **Auth**: NextAuth.js or custom JWT

### Customer (Tauri)

- **Framework**: Tauri
- **Frontend**: React + TypeScript
- **Styling**: Tailwind CSS
- **Backend Communication**: HTTP API to Go server

---

## NEXT STEPS

1. **Sau khi bạn review & approve design này**:
   - Tạo Go project structure
   - Tạo database migrations
   - Bắt đầu implement endpoints

2. **Công việc cụ thể bước tới**:
   - Setup PostgreSQL/MySQL
   - GORM models
   - Database migrations
   - Authentication layer
   - File upload handling
