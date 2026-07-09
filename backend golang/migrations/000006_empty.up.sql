-- Seed default admin user
INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
VALUES (
    'a0000000-0000-4000-8000-000000000001',
    'admin@launcher.com',
    '$2a$10$OUdz9fVPDQsdw74ld1gUv./3HIGQxPMFBi.cYJYDWkKbCJHHfW6xu',
    'Admin',
    'admin',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (email) DO NOTHING;
