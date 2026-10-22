-- 002_upgrades_schema.down.sql
-- Hoàn tác nâng cấp hệ thống: Xóa bảng phụ trợ theo thứ tự an toàn

DROP TABLE IF EXISTS arena_admin_audit_logs CASCADE;
DROP TABLE IF EXISTS arena_team_profiles CASCADE;
DROP TABLE IF EXISTS arena_notifications CASCADE;
DROP TABLE IF EXISTS arena_password_audit_logs CASCADE;
DROP TABLE IF EXISTS arena_password_resets CASCADE;
