# Launcher Desktop (Tauri + React)

Đây là ứng dụng desktop cho người dùng cuối của hệ thống Launcher App.

## Chức năng chính

- Đăng nhập/đăng ký tài khoản người dùng.
- Duyệt Store và thêm app vào thư viện.
- Cài đặt/cập nhật app theo cơ chế manifest-based.
- Chỉ tải file thay đổi (so hash theo manifest).
- Launch app trực tiếp từ thư mục managed local.

## Kiến trúc cập nhật hiện tại

- Backend trả `manifest_url` cho mỗi version release.
- Launcher tải `manifest.json` trước.
- So sánh hash file local với hash trong manifest.
- Chỉ tải file mới/thay đổi.
- Lưu app ở:
  - `%LOCALAPPDATA%/LauncherApps/{slug}`

## Yêu cầu môi trường

- Node.js 20+
- Rust toolchain (stable)
- Tauri CLI (`@tauri-apps/cli` đã có trong devDependencies)
- Windows: cần WebView2 Runtime
- Backend Go đang chạy tại `http://localhost:8080`

## Cài đặt & chạy

```bash
npm install
npm run dev
```

Chạy desktop Tauri (development):

```bash
npx tauri dev
```

## Build

Build frontend web assets:

```bash
npm run build
```

Build desktop app (Tauri bundle):

```bash
npx tauri build
```

## Scripts

- `npm run dev`: chạy Vite dev server
- `npm run build`: build TypeScript + Vite
- `npm run lint`: lint source
- `npm run preview`: preview bản web build

## API endpoint mặc định

Trong code hiện tại, launcher gọi API tại:

- `http://localhost:8080/api`

Nếu muốn đổi URL backend, cập nhật hằng số `API_BASE` trong `src/lib/api.ts`.

## Xử lý sự cố nhanh

- Nếu Tauri báo lỗi compile Rust, chạy:
  - `cd src-tauri && cargo check`
- Nếu app không tải được file, kiểm tra:
  - Backend đang chạy.
  - `manifest_url` của version có thể truy cập.
  - Supabase bucket/public URL cấu hình đúng.
