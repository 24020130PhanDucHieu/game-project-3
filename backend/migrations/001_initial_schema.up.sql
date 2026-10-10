-- 001_initial_schema.up.sql
-- Cấu trúc cơ sở dữ liệu PostgreSQL / SQLite cho hệ thống Đấu Trường OTTV2 ICPC K69

CREATE TABLE IF NOT EXISTS tournaments (
    tournament_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    num_teams INT NOT NULL DEFAULT 8,
    status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data JSONB
);

CREATE TABLE IF NOT EXISTS teams (
    team_id VARCHAR(64) PRIMARY KEY,
    tournament_id VARCHAR(64) REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
    team_name VARCHAR(255) NOT NULL,
    student_id VARCHAR(64) NOT NULL,
    university VARCHAR(255),
    rating INT DEFAULT 1200,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matches (
    match_id VARCHAR(64) PRIMARY KEY,
    tournament_id VARCHAR(64) REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    team_a_id VARCHAR(64),
    team_b_id VARCHAR(64),
    winner_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournaments_created_at ON tournaments(created_at);
CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
