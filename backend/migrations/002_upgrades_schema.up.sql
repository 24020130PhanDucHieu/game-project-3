-- 002_upgrades_schema.up.sql
-- Nâng cấp hệ thống: Mật khẩu an toàn, Trung tâm thông báo, Hồ sơ đội và Nhật ký quản trị

-- 1. Bảng mã xác nhận đặt lại mật khẩu (Không lưu mật khẩu cũ, tự hết hạn sau 15 phút)
CREATE TABLE IF NOT EXISTS arena_password_resets (
    student_id VARCHAR(64) NOT NULL,
    reset_token_hash VARCHAR(128) PRIMARY KEY,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pwd_resets_student ON arena_password_resets(student_id);

-- 2. Nhật ký kiểm toán mật khẩu (Ghi nhận yêu cầu & đổi mật khẩu an toàn)
CREATE TABLE IF NOT EXISTS arena_password_audit_logs (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL, -- REQUEST_RESET, RESET_SUCCESS, RESET_FAILED
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pwd_audit_student ON arena_password_audit_logs(student_id, created_at);

-- 3. Trung tâm thông báo người dùng (Tránh gửi trùng bằng dedup_key)
CREATE TABLE IF NOT EXISTS arena_notifications (
    id VARCHAR(64) PRIMARY KEY,
    recipient_id VARCHAR(64) NOT NULL, -- student_id hoặc "ALL" hoặc "ADMIN"
    event_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link_tab VARCHAR(64),
    link_data JSONB DEFAULT '{}',
    dedup_key VARCHAR(128) UNIQUE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON arena_notifications(recipient_id, is_read, created_at);

-- 4. Hồ sơ đội thi đấu mở rộng
CREATE TABLE IF NOT EXISTS arena_team_profiles (
    student_id VARCHAR(64) PRIMARY KEY,
    team_name VARCHAR(128) NOT NULL,
    captain_name VARCHAR(128),
    university VARCHAR(128) DEFAULT 'ĐHQG Hà Nội',
    members JSONB DEFAULT '[]',
    preferred_language VARCHAR(32) DEFAULT 'PYTHON',
    bio TEXT DEFAULT '',
    achievements JSONB DEFAULT '[]',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Nhật ký quản trị giải đấu (Admin Audit Logs cho gia hạn thời gian, đổi bảng, đổi luật)
CREATE TABLE IF NOT EXISTS arena_admin_audit_logs (
    id SERIAL PRIMARY KEY,
    admin_user VARCHAR(64) NOT NULL DEFAULT 'admin',
    action VARCHAR(64) NOT NULL,
    tournament_id VARCHAR(64),
    match_id VARCHAR(64),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_tourn ON arena_admin_audit_logs(tournament_id, created_at);
