-- =============================================================================
-- RELATIONAL DATABASE SCHEMA (PostgreSQL / SQLite Compatible)
-- Dành cho mở rộng cụm Multi-Node trong tương lai nếu cần chuyển đổi khỏi file JSON
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    student_id VARCHAR(32) PRIMARY KEY,
    full_name VARCHAR(128) NOT NULL,
    class_name VARCHAR(64) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
    tournament_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    num_teams INTEGER NOT NULL DEFAULT 8,
    status VARCHAR(32) NOT NULL DEFAULT 'READY',
    champion VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_teams (
    tournament_id VARCHAR(64) REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
    student_id VARCHAR(32) NOT NULL,
    team_name VARCHAR(128) NOT NULL,
    seed INTEGER NOT NULL,
    university VARCHAR(128) DEFAULT 'Khối Kỹ Thuật',
    elo INTEGER DEFAULT 1200,
    PRIMARY KEY (tournament_id, student_id)
);

CREATE TABLE IF NOT EXISTS matches (
    match_id VARCHAR(64) PRIMARY KEY,
    tournament_id VARCHAR(64) REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    round_level INTEGER NOT NULL,
    round_name VARCHAR(64) NOT NULL,
    team_a_student_id VARCHAR(32),
    team_b_student_id VARCHAR(32),
    status VARCHAR(32) NOT NULL DEFAULT 'READY',
    round_status VARCHAR(32) NOT NULL DEFAULT 'AWAITING_SUBMISSIONS',
    current_round_idx INTEGER NOT NULL DEFAULT 1,
    max_rounds INTEGER NOT NULL DEFAULT 5,
    winner VARCHAR(32),
    winner_name VARCHAR(128),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
    submission_id VARCHAR(64) PRIMARY KEY,
    match_id VARCHAR(64) REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    side VARCHAR(16) NOT NULL,
    student_id VARCHAR(32) NOT NULL,
    team_name VARCHAR(128) NOT NULL,
    language VARCHAR(16) NOT NULL DEFAULT 'PYTHON',
    code_content TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT FALSE,
    validation_status VARCHAR(32) NOT NULL,
    validation_error TEXT,
    execution_time_ms REAL DEFAULT 0,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS round_history (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(64) REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    sub_a_id VARCHAR(64) REFERENCES submissions(submission_id),
    sub_b_id VARCHAR(64) REFERENCES submissions(submission_id),
    winner VARCHAR(32) NOT NULL,
    winner_name VARCHAR(128),
    win_reason TEXT NOT NULL,
    board_steps JSONB NOT NULL,
    move_logs JSONB NOT NULL,
    bot_logs JSONB NOT NULL,
    system_logs JSONB NOT NULL,
    played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chỉ mục tối ưu hóa truy vấn đồng thời
CREATE INDEX IF NOT EXISTS idx_matches_tourn ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_submissions_match ON submissions(match_id, round_number);
CREATE INDEX IF NOT EXISTS idx_round_history_match ON round_history(match_id, round_number);
