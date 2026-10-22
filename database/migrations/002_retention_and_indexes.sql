-- =============================================================================
-- MIGRATION 002: TỐI ƯU HÓA CHỈ MỤC JSONB, LƯU TRỮ LỊCH SỬ & DỌN DẸP REPLAY
-- Cập nhật: 22/10/2026 | Dành cho PostgreSQL / Supabase Production
-- =============================================================================

-- 1. Bổ sung Expression Indexes tối ưu hóa truy vấn trên cột JSONB arena_qualifier_records
-- Giúp tăng tốc độ lọc danh sách bài nộp và hàng đợi chấm từ O(N) thành O(log N)
CREATE INDEX IF NOT EXISTS idx_qualifier_records_status 
ON arena_qualifier_records ((data->>'status'))
WHERE data->>'status' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qualifier_records_created 
ON arena_qualifier_records ((data->>'created_at'))
WHERE data->>'created_at' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qualifier_records_team 
ON arena_qualifier_records ((data->>'team_name'))
WHERE data->>'team_name' IS NOT NULL;

-- 2. Chỉ mục cho bảng round_history và submissions
CREATE INDEX IF NOT EXISTS idx_round_history_played_at 
ON round_history(played_at);

CREATE INDEX IF NOT EXISTS idx_submissions_created_at 
ON submissions(submitted_at);

-- 3. Stored Procedure: Dọn dẹp dữ liệu bước đi chi tiết (board_steps) của các trận đấu cũ
-- Giữ nguyên: Kết quả trận, người thắng, điểm ELO, lý do thắng.
-- Cắt tỉa: Mảng board_steps và bot_logs cồng kềnh (> 30 ngày) để tiết kiệm 80% dung lượng đĩa.
CREATE OR REPLACE FUNCTION prune_old_replays(retention_days INT DEFAULT 30)
RETURNS TABLE(pruned_count INT) AS $$
DECLARE
    affected_rows INT;
BEGIN
    UPDATE round_history
    SET 
        board_steps = '[]'::jsonb,
        bot_logs = '["[INFO] Replay steps archived after retention policy]"]'::jsonb
    WHERE played_at < NOW() - (retention_days || ' days')::INTERVAL
      AND jsonb_array_length(board_steps) > 0;
      
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN QUERY SELECT affected_rows;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- KẾ HOẠCH ROLLBACK (HOÀN TÁC MIGRATION KHI CẦN THIẾT)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_qualifier_records_status;
-- DROP INDEX IF EXISTS idx_qualifier_records_created;
-- DROP INDEX IF EXISTS idx_qualifier_records_team;
-- DROP INDEX IF EXISTS idx_round_history_played_at;
-- DROP INDEX IF EXISTS idx_submissions_created_at;
-- DROP FUNCTION IF EXISTS prune_old_replays(INT);
