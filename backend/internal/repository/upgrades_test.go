package repository_test

import (
	"path/filepath"
	"testing"
	"time"

	"project-tuan3/internal/repository"
)

func TestPasswordResetFlowAndAuditLogs(t *testing.T) {
	dir := t.TempDir()
	accounts, err := repository.NewAccounts(nil, filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatalf("Failed to init accounts: %v", err)
	}

	sid := "24020999"
	err = accounts.Create(sid, "Test Team", "OldPassword123")
	if err != nil {
		t.Fatalf("Create account error: %v", err)
	}

	// 1. Yêu cầu đặt lại mật khẩu
	token, err := accounts.RequestPasswordReset(sid, "127.0.0.1", "Go-Test-Agent")
	if err != nil {
		t.Fatalf("RequestPasswordReset error: %v", err)
	}
	if len(token) != 6 {
		t.Fatalf("Expected 6-digit token, got: %s", token)
	}

	// 2. Không cho đặt mật khẩu quá ngắn
	err = accounts.ResetPasswordWithToken(sid, token, "123", "127.0.0.1", "Go-Test-Agent")
	if err != repository.ErrPasswordTooShort {
		t.Fatalf("Expected ErrPasswordTooShort, got: %v", err)
	}

	// 3. Đặt mật khẩu với token sai
	err = accounts.ResetPasswordWithToken(sid, "000000", "NewPassword456", "127.0.0.1", "Go-Test-Agent")
	if err != repository.ErrResetTokenInvalid {
		t.Fatalf("Expected ErrResetTokenInvalid, got: %v", err)
	}

	// 4. Đặt mật khẩu thành công với token đúng
	err = accounts.ResetPasswordWithToken(sid, token, "NewPassword456", "127.0.0.1", "Go-Test-Agent")
	if err != nil {
		t.Fatalf("ResetPasswordWithToken error: %v", err)
	}

	// 5. Token đã dùng không được dùng lại
	err = accounts.ResetPasswordWithToken(sid, token, "AnotherPassword789", "127.0.0.1", "Go-Test-Agent")
	if err != repository.ErrResetTokenInvalid {
		t.Fatalf("Expected token to be consumed, got: %v", err)
	}

	// 6. Mật khẩu cũ không đăng nhập được nữa
	_, err = accounts.Authenticate(sid, "OldPassword123")
	if err == nil {
		t.Fatal("Expected old password to fail authentication")
	}

	// 7. Mật khẩu mới đăng nhập thành công
	acc, err := accounts.Authenticate(sid, "NewPassword456")
	if err != nil {
		t.Fatalf("Failed to authenticate with new password: %v", err)
	}
	if acc.StudentID != sid {
		t.Fatalf("Expected student ID %s, got: %s", sid, acc.StudentID)
	}
}

func TestNotificationsDedupAndReadStatus(t *testing.T) {
	dir := t.TempDir()
	accounts, err := repository.NewAccounts(nil, filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatalf("Failed to init accounts: %v", err)
	}

	sid := "24020888"

	// 1. Tạo thông báo có dedup_key
	n1 := repository.Notification{
		ID:          "notif_1",
		RecipientID: sid,
		EventType:   "ROUND_OPEN",
		Title:       "Mở vòng loại",
		Message:     "Vòng loại số 1 đã mở nộp bài.",
		LinkTab:     "qualifier",
		DedupKey:    "round_open_event_1",
		CreatedAt:   time.Now().UTC(),
	}
	if err = accounts.CreateNotification(n1); err != nil {
		t.Fatalf("CreateNotification error: %v", err)
	}

	// 2. Gửi lại cùng dedup_key -> không trùng lặp
	if err = accounts.CreateNotification(n1); err != nil {
		t.Fatalf("CreateNotification dedup error: %v", err)
	}

	// 3. Gửi thông báo chung broadcast ALL
	n2 := repository.Notification{
		ID:          "notif_2",
		RecipientID: "ALL",
		EventType:   "ANNOUNCEMENT",
		Title:       "Thông báo từ BTC",
		Message:     "Lịch thi đấu đã cập nhật.",
		LinkTab:     "bracket",
		CreatedAt:   time.Now().UTC(),
	}
	if err = accounts.CreateNotification(n2); err != nil {
		t.Fatalf("CreateNotification error: %v", err)
	}

	// 4. Lấy danh sách thông báo cho thí sinh
	list, unread, err := accounts.ListNotifications(sid, 50)
	if err != nil {
		t.Fatalf("ListNotifications error: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("Expected 2 notifications, got %d", len(list))
	}
	if unread != 2 {
		t.Fatalf("Expected 2 unread notifications, got %d", unread)
	}

	// 5. Đánh dấu đã đọc 1 thông báo
	err = accounts.MarkNotificationRead("notif_1", sid)
	if err != nil {
		t.Fatalf("MarkNotificationRead error: %v", err)
	}
	_, unread, _ = accounts.ListNotifications(sid, 50)
	if unread != 1 {
		t.Fatalf("Expected 1 unread notification, got %d", unread)
	}

	// 6. Đánh dấu tất cả đã đọc
	err = accounts.MarkAllNotificationsRead(sid)
	if err != nil {
		t.Fatalf("MarkAllNotificationsRead error: %v", err)
	}
	_, unread, _ = accounts.ListNotifications(sid, 50)
	if unread != 0 {
		t.Fatalf("Expected 0 unread notifications, got %d", unread)
	}
}

func TestTeamProfileAndAdminAuditLogs(t *testing.T) {
	dir := t.TempDir()
	accounts, err := repository.NewAccounts(nil, filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatalf("Failed to init accounts: %v", err)
	}

	sid := "24020777"
	_ = accounts.Create(sid, "Original Name", "pass123")

	// 1. Lấy profile mặc định
	prof, err := accounts.GetTeamProfile(sid)
	if err != nil {
		t.Fatalf("GetTeamProfile error: %v", err)
	}
	if prof.TeamName != "Original Name" {
		t.Fatalf("Expected team name 'Original Name', got: %s", prof.TeamName)
	}

	// 2. Cập nhật profile
	prof.TeamName = "UET Champions"
	prof.University = "ĐH Công Nghệ"
	prof.Bio = "Chiến thắng mọi đối thủ"
	prof.PreferredLanguage = "CPP"
	prof.Members = []interface{}{
		map[string]interface{}{"name": "Nguyễn Văn A", "student_id": sid, "role": "Đội trưởng"},
		map[string]interface{}{"name": "Trần Thị B", "student_id": "24020778", "role": "Thành viên"},
	}
	err = accounts.UpdateTeamProfile(prof)
	if err != nil {
		t.Fatalf("UpdateTeamProfile error: %v", err)
	}

	updated, err := accounts.GetTeamProfile(sid)
	if err != nil {
		t.Fatalf("GetTeamProfile error: %v", err)
	}
	if updated.TeamName != "UET Champions" || len(updated.Members) != 2 || updated.PreferredLanguage != "CPP" {
		t.Fatalf("Profile update not reflected: %+v", updated)
	}

	// 3. Admin audit logs
	err = accounts.LogAdminAction("admin", "EXTEND_DEADLINE", "tourn_1", "", map[string]interface{}{"extra_minutes": 30})
	if err != nil {
		t.Fatalf("LogAdminAction error: %v", err)
	}
	logs, err := accounts.ListAdminAuditLogs("tourn_1", 10)
	if err != nil {
		t.Fatalf("ListAdminAuditLogs error: %v", err)
	}
	if len(logs) != 1 || logs[0].Action != "EXTEND_DEADLINE" {
		t.Fatalf("Expected 1 audit log, got: %+v", logs)
	}
}
