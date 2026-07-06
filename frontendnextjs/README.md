# Admin Dashboard (Next.js)

Đây là giao diện quản trị cho hệ thống Launcher App.

## Chức năng chính

- Quản lý ứng dụng (tạo, sửa, publish/unpublish, xoá).
- Upload version mới bằng file build hoặc ZIP.
- Quản lý release version và trạng thái bắt buộc cập nhật.
- Theo dõi danh sách user và các tác vụ quản trị liên quan.

## Yêu cầu môi trường

- Node.js 20+
- Backend Go đang chạy tại `http://localhost:8080`

## Cấu hình API

Mặc định frontend gọi API đến:

- `http://localhost:8080/api`

Có thể đổi bằng biến môi trường:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
```

## Cài đặt & chạy

```bash
npm install
npm run dev
```

Mở trình duyệt tại:

- `http://localhost:3000`

## Build production

```bash
npm run build
npm run start
```

## Scripts

- `npm run dev`: chạy môi trường phát triển
- `npm run build`: build production
- `npm run start`: chạy bản build production
- `npm run lint`: kiểm tra lint

## Ghi chú

- Luồng version hiện tại dùng kiến trúc manifest:
  - DB lưu `manifest_url` (không còn `download_url`).
  - Client tải manifest trước, so hash rồi chỉ tải file thay đổi.
