package repository

import (
	"log"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrResetTokenInvalid = errors.New("Mã xác thực đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.")
	ErrPasswordTooShort  = errors.New("Mật khẩu mới phải có độ dài từ 6 ký tự trở lên.")
)

type PasswordReset struct {
	StudentID      string    `json:"student_id"`
	ResetTokenHash string    `json:"reset_token_hash"`
	ExpiresAt      time.Time `json:"expires_at"`
	Used           bool      `json:"used"`
	CreatedAt      time.Time `json:"created_at"`
}

type PasswordAuditLog struct {
	ID        int       `json:"id"`
	StudentID string    `json:"student_id"`
	Action    string    `json:"action"` // REQUEST_RESET, RESET_SUCCESS, RESET_FAILED
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
}

type Notification struct {
	ID          string                 `json:"id"`
	RecipientID string                 `json:"recipient_id"` // student_id, "ALL", "ADMIN"
	EventType   string                 `json:"event_type"`
	Title       string                 `json:"title"`
	Message     string                 `json:"message"`
	LinkTab     string                 `json:"link_tab"`
	LinkData    map[string]interface{} `json:"link_data"`
	DedupKey    string                 `json:"dedup_key,omitempty"`
	IsRead      bool                   `json:"is_read"`
	CreatedAt   time.Time              `json:"created_at"`
}

type TeamProfile struct {
	StudentID         string        `json:"student_id"`
	TeamName          string        `json:"team_name"`
	CaptainName       string        `json:"captain_name"`
	University        string        `json:"university"`
	Members           []interface{} `json:"members"`
	PreferredLanguage string        `json:"preferred_language"`
	Bio               string        `json:"bio"`
	Achievements      []interface{} `json:"achievements"`
	UpdatedAt         time.Time     `json:"updated_at"`
}

type AdminAuditLog struct {
	ID           int                    `json:"id"`
	AdminUser    string                 `json:"admin_user"`
	Action       string                 `json:"action"`
	TournamentID string                 `json:"tournament_id"`
	MatchID      string                 `json:"match_id"`
	Details      map[string]interface{} `json:"details"`
	CreatedAt    time.Time              `json:"created_at"`
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(h[:])
}

// SetPassword updates the account password safely (bcrypt hash + AES secret), preserving account integrity.
func (s *Accounts) SetPassword(id, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id = accountID(id)
	a, err := s.get(id)
	if err != nil {
		return err
	}
	if a.Deleted {
		return ErrAccountMissing
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	sealed, err := s.sealPassword(id, newPassword)
	if err != nil {
		return err
	}
	a.Hash = string(hash)
	a.Secret = sealed
	a.PasswordChangedAt = time.Now().UTC()
	return s.save(a, false)
}

// RequestPasswordReset generates an unpredictable one-time code valid for 15 minutes.
func (s *Accounts) RequestPasswordReset(studentID, ip, userAgent string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sid := accountID(studentID)
	a, err := s.get(sid)
	if err != nil {
		return "", ErrAccountMissing
	}
	if a.Deleted {
		return "", ErrAccountMissing
	}

	// 128 bits of entropy; only the hash is stored.
	var randomToken [16]byte
	_, err = rand.Read(randomToken[:])
	if err != nil {
		return "", err
	}
	token := hex.EncodeToString(randomToken[:])
	tokenHash := hashToken(token)
	expiresAt := time.Now().UTC().Add(15 * time.Minute)

	if s.db != nil {
		_, err = s.db.Exec(`INSERT INTO arena_password_resets (student_id, reset_token_hash, expires_at, used) VALUES ($1, $2, $3, false)`, sid, tokenHash, expiresAt)
		if err != nil {
			return "", err
		}
		_, _ = s.db.Exec(`INSERT INTO arena_password_audit_logs (student_id, action, ip_address, user_agent) VALUES ($1, 'REQUEST_RESET', $2, $3)`, sid, ip, userAgent)
	} else {
		s.resets[tokenHash] = PasswordReset{
			StudentID:      sid,
			ResetTokenHash: tokenHash,
			ExpiresAt:      expiresAt,
			Used:           false,
			CreatedAt:      time.Now().UTC(),
		}
		s.pwdAudits = append(s.pwdAudits, PasswordAuditLog{
			ID:        len(s.pwdAudits) + 1,
			StudentID: sid,
			Action:    "REQUEST_RESET",
			IPAddress: ip,
			UserAgent: userAgent,
			CreatedAt: time.Now().UTC(),
		})
	}

	return token, nil
}

// ResetPasswordWithToken verifies token, updates password, marks token as used, and logs the action.
func (s *Accounts) ResetPasswordWithToken(studentID, token, newPassword, ip, userAgent string) error {
	if len(strings.TrimSpace(newPassword)) < 6 || len(newPassword) > 72 {
		return ErrPasswordTooShort
	}
	sid := accountID(studentID)
	tokenHash := hashToken(token)

	s.mu.Lock()
	defer s.mu.Unlock()

	var valid bool
	if s.db != nil {
		var expiresAt time.Time
		var used bool
		err := s.db.QueryRow(`SELECT expires_at, used FROM arena_password_resets WHERE student_id = $1 AND reset_token_hash = $2`, sid, tokenHash).Scan(&expiresAt, &used)
		if err == nil && !used && time.Now().UTC().Before(expiresAt) {
			valid = true
		}
	} else {
		rec, exists := s.resets[tokenHash]
		if exists && rec.StudentID == sid && !rec.Used && time.Now().UTC().Before(rec.ExpiresAt) {
			valid = true
		}
	}

	if !valid {
		if s.db != nil {
			_, _ = s.db.Exec(`INSERT INTO arena_password_audit_logs (student_id, action, ip_address, user_agent) VALUES ($1, 'RESET_FAILED', $2, $3)`, sid, ip, userAgent)
		} else {
			s.pwdAudits = append(s.pwdAudits, PasswordAuditLog{
				ID:        len(s.pwdAudits) + 1,
				StudentID: sid,
				Action:    "RESET_FAILED",
				IPAddress: ip,
				UserAgent: userAgent,
				CreatedAt: time.Now().UTC(),
			})
		}
		return ErrResetTokenInvalid
	}

	// Đổi mật khẩu
	a, err := s.get(sid)
	if err != nil {
		return err
	}
	if a.Deleted {
		return ErrAccountMissing
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	sealed, err := s.sealPassword(sid, newPassword)
	if err != nil {
		return err
	}
	a.Hash = string(hash)
	a.Secret = sealed
	a.PasswordChangedAt = time.Now().UTC()
	if s.db != nil {
		// Token consumption and password change commit together, including on retry.
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		result, err := tx.Exec(`UPDATE arena_password_resets SET used=true WHERE student_id=$1 AND reset_token_hash=$2 AND used=false AND expires_at>NOW()`, sid, tokenHash)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count != 1 {
			return ErrResetTokenInvalid
		}
		data, err := json.Marshal(a)
		if err != nil {
			return err
		}
		result, err = tx.Exec(`UPDATE arena_accounts SET data=$2 WHERE student_id=$1 AND COALESCE((data->>'deleted')::boolean,false)=false`, sid, string(data))
		if err != nil {
			return err
		}
		count, err = result.RowsAffected()
		if err != nil {
			return err
		}
		if count != 1 {
			return ErrAccountMissing
		}
		if _, err = tx.Exec(`UPDATE arena_password_resets SET used=true WHERE student_id=$1`, sid); err != nil {
			return err
		}
		if _, err = tx.Exec(`INSERT INTO arena_password_audit_logs (student_id, action, ip_address, user_agent) VALUES ($1, 'RESET_SUCCESS', $2, $3)`, sid, ip, userAgent); err != nil {
			return err
		}
		return tx.Commit()
	} else {
		if err = s.save(a, false); err != nil {
			return err
		}
		for key, rec := range s.resets {
			if rec.StudentID == sid {
				rec.Used = true
				s.resets[key] = rec
			}
		}
		s.pwdAudits = append(s.pwdAudits, PasswordAuditLog{
			ID:        len(s.pwdAudits) + 1,
			StudentID: sid,
			Action:    "RESET_SUCCESS",
			IPAddress: ip,
			UserAgent: userAgent,
			CreatedAt: time.Now().UTC(),
		})
	}

	return nil
}

// CreateNotification sends or deduplicates a notification.
func (s *Accounts) CreateNotification(n Notification) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if n.ID == "" {
		b := make([]byte, 8)
		_, _ = rand.Read(b)
		n.ID = fmt.Sprintf("notif_%s_%x", time.Now().Format("20060102150405"), b)
	}
	if n.CreatedAt.IsZero() {
		n.CreatedAt = time.Now().UTC()
	}
	if n.LinkData == nil {
		n.LinkData = map[string]interface{}{}
	}

	if s.db != nil {
		linkDataJSON, _ := json.Marshal(n.LinkData)
		_, err := s.db.Exec(`
INSERT INTO arena_notifications (id, recipient_id, event_type, title, message, link_tab, link_data, dedup_key, is_read, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (dedup_key) DO NOTHING`,
			n.ID, n.RecipientID, n.EventType, n.Title, n.Message, n.LinkTab, string(linkDataJSON), sql.NullString{String: n.DedupKey, Valid: n.DedupKey != ""}, n.IsRead, n.CreatedAt)
		return err
	}

	// In-memory dedup
	if n.DedupKey != "" {
		for _, existing := range s.notifications {
			if existing.DedupKey == n.DedupKey {
				return nil
			}
		}
	}
	s.notifications = append(s.notifications, n)
	return nil
}

// ListNotifications retrieves notifications for a recipient + ALL, returning unread count.
func (s *Accounts) ListNotifications(recipientID string, limit int) ([]Notification, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if limit <= 0 || limit > 100 {
		limit = 50
	}

	sid := accountID(recipientID)
	var list []Notification
	var unreadCount int

	if s.db != nil {
		rows, err := s.db.Query(`
SELECT id, recipient_id, event_type, title, message, link_tab, COALESCE(link_data, '{}'::jsonb), COALESCE(dedup_key, ''),
((is_read AND recipient_id = $1) OR EXISTS (SELECT 1 FROM arena_notification_reads r WHERE r.notification_id = n.id AND r.recipient_id = $1)), created_at
FROM arena_notifications n
WHERE recipient_id = $1 OR recipient_id = 'ALL'
ORDER BY created_at DESC
LIMIT $2`, sid, limit)
		if err != nil {
			return nil, 0, err
		}
		defer rows.Close()

		for rows.Next() {
			var n Notification
			var linkDataRaw []byte
			if err := rows.Scan(&n.ID, &n.RecipientID, &n.EventType, &n.Title, &n.Message, &n.LinkTab, &linkDataRaw, &n.DedupKey, &n.IsRead, &n.CreatedAt); err != nil {
				return nil, 0, err
			}
			_ = json.Unmarshal(linkDataRaw, &n.LinkData)
			if !n.IsRead {
				unreadCount++
			}
			list = append(list, n)
		}
		return list, unreadCount, rows.Err()
	}

	for _, n := range s.notifications {
		if n.RecipientID == sid || n.RecipientID == "ALL" || (sid == "ADMIN" && n.RecipientID == "ADMIN") {
			n.IsRead = (n.IsRead && n.RecipientID == sid) || s.notificationReads[sid][n.ID]
			list = append(list, n)
			if !n.IsRead {
				unreadCount++
			}
		}
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.After(list[j].CreatedAt)
	})
	if len(list) > limit {
		list = list[:limit]
	}
	return list, unreadCount, nil
}

// MarkNotificationRead marks a single notification as read.
func (s *Accounts) MarkNotificationRead(id, recipientID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	sid := accountID(recipientID)
	if s.db != nil {
		_, err := s.db.Exec(`INSERT INTO arena_notification_reads(notification_id, recipient_id)
SELECT id, $2::VARCHAR(64) FROM arena_notifications WHERE id = $1::VARCHAR(64) AND (recipient_id = $2::VARCHAR(64) OR recipient_id = 'ALL' OR ($2::VARCHAR(64) = 'ADMIN' AND recipient_id = 'ADMIN'))
ON CONFLICT DO NOTHING`, id, sid)
		if err != nil {
			log.Printf("notification read %s/%s: %v", id, sid, err)
		}
		return err
	}

	for i := range s.notifications {
		if s.notifications[i].ID == id && (s.notifications[i].RecipientID == sid || s.notifications[i].RecipientID == "ALL") {
			if s.notificationReads[sid] == nil {
				s.notificationReads[sid] = map[string]bool{}
			}
			s.notificationReads[sid][id] = true
			break
		}
	}
	return nil
}

// MarkAllNotificationsRead marks all notifications for recipient or ALL as read.
func (s *Accounts) MarkAllNotificationsRead(recipientID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sid := accountID(recipientID)

	if s.db != nil {
		_, err := s.db.Exec(`INSERT INTO arena_notification_reads(notification_id, recipient_id)
SELECT id, $1::VARCHAR(64) FROM arena_notifications WHERE recipient_id = $1::VARCHAR(64) OR recipient_id = 'ALL'
ON CONFLICT DO NOTHING`, sid)
		if err != nil {
			log.Printf("notification read-all %s: %v", sid, err)
		}
		return err
	}

	for i := range s.notifications {
		if s.notifications[i].RecipientID == sid || s.notifications[i].RecipientID == "ALL" {
			if s.notificationReads[sid] == nil {
				s.notificationReads[sid] = map[string]bool{}
			}
			s.notificationReads[sid][s.notifications[i].ID] = true
		}
	}
	return nil
}

// GetTeamProfile retrieves a team's profile or creates a default from account.
func (s *Accounts) GetTeamProfile(studentID string) (TeamProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sid := accountID(studentID)

	if s.db != nil {
		var p TeamProfile
		var membersRaw, achRaw []byte
		err := s.db.QueryRow(`
SELECT student_id, team_name, COALESCE(captain_name, ''), COALESCE(university, ''), COALESCE(members, '[]'::jsonb), COALESCE(preferred_language, 'PYTHON'), COALESCE(bio, ''), COALESCE(achievements, '[]'::jsonb), updated_at
FROM arena_team_profiles WHERE student_id = $1`, sid).Scan(
			&p.StudentID, &p.TeamName, &p.CaptainName, &p.University, &membersRaw, &p.PreferredLanguage, &p.Bio, &achRaw, &p.UpdatedAt)
		if err == nil {
			_ = json.Unmarshal(membersRaw, &p.Members)
			_ = json.Unmarshal(achRaw, &p.Achievements)
			return p, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return p, err
		}
	} else {
		if p, exists := s.profiles[sid]; exists {
			return p, nil
		}
	}

	// Fallback to Account default
	a, err := s.get(sid)
	if err != nil {
		return TeamProfile{}, err
	}

	defaultProf := TeamProfile{
		StudentID:         sid,
		TeamName:          a.TeamName,
		CaptainName:       a.TeamName,
		University:        "ĐHQG Hà Nội",
		Members:           []interface{}{map[string]interface{}{"name": a.TeamName, "student_id": sid, "role": "Đội trưởng"}},
		PreferredLanguage: "PYTHON",
		Bio:               "Đội thi đấu BOT ARENA",
		Achievements:      []interface{}{},
		UpdatedAt:         time.Now().UTC(),
	}
	return defaultProf, nil
}

// UpdateTeamProfile updates or inserts team profile and synchronizes TeamName with Account.
func (s *Accounts) UpdateTeamProfile(p TeamProfile) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p.StudentID = accountID(p.StudentID)
	account, err := s.get(p.StudentID)
	if err != nil || account.Deleted {
		return ErrAccountMissing
	}
	if len(p.CaptainName) > 256 || len(p.University) > 256 || len(p.Bio) > 2000 || len(p.Members) > 10 {
		return errors.New("Hồ sơ quá dài: tối đa 10 thành viên và 2.000 byte giới thiệu.")
	}
	if p.PreferredLanguage != "" && p.PreferredLanguage != "PYTHON" && p.PreferredLanguage != "CPP" {
		return errors.New("Ngôn ngữ không hợp lệ.")
	}
	p.TeamName = strings.TrimSpace(p.TeamName)
	if p.TeamName == "" {
		return errors.New("Tên đội không được để trống.")
	}
	if len(p.TeamName) > 128 {
		return errors.New("Tên đội không được vượt quá 128 ký tự.")
	}
	if p.University == "" {
		p.University = "ĐHQG Hà Nội"
	}
	if p.PreferredLanguage == "" {
		p.PreferredLanguage = "PYTHON"
	}
	p.UpdatedAt = time.Now().UTC()

	// Cập nhật tên đội trong Account
	if a, err := s.get(p.StudentID); err == nil && !a.Deleted {
		a.TeamName = p.TeamName
		if err := s.save(a, false); err != nil {
			return err
		}
	}

	membersJSON, _ := json.Marshal(p.Members)
	achJSON, _ := json.Marshal(p.Achievements)

	if s.db != nil {
		_, err := s.db.Exec(`
INSERT INTO arena_team_profiles (student_id, team_name, captain_name, university, members, preferred_language, bio, achievements, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (student_id) DO UPDATE SET
	team_name = EXCLUDED.team_name,
	captain_name = EXCLUDED.captain_name,
	university = EXCLUDED.university,
	members = EXCLUDED.members,
	preferred_language = EXCLUDED.preferred_language,
	bio = EXCLUDED.bio,
	achievements = EXCLUDED.achievements,
	updated_at = EXCLUDED.updated_at`,
			p.StudentID, p.TeamName, p.CaptainName, p.University, string(membersJSON), p.PreferredLanguage, p.Bio, string(achJSON), p.UpdatedAt)
		return err
	}

	s.profiles[p.StudentID] = p
	return nil
}

// LogAdminAction records administrative operations for audit trail.
func (s *Accounts) LogAdminAction(adminUser, action, tournamentID, matchID string, details map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if adminUser == "" {
		adminUser = "admin"
	}
	if details == nil {
		details = map[string]interface{}{}
	}

	if s.db != nil {
		detailsJSON, _ := json.Marshal(details)
		_, err := s.db.Exec(`
INSERT INTO arena_admin_audit_logs (admin_user, action, tournament_id, match_id, details)
VALUES ($1, $2, $3, $4, $5)`,
			adminUser, action, tournamentID, matchID, string(detailsJSON))
		return err
	}

	s.adminLogs = append(s.adminLogs, AdminAuditLog{
		ID:           len(s.adminLogs) + 1,
		AdminUser:    adminUser,
		Action:       action,
		TournamentID: tournamentID,
		MatchID:      matchID,
		Details:      details,
		CreatedAt:    time.Now().UTC(),
	})
	return nil
}

// ListAdminAuditLogs returns latest admin audit logs.
func (s *Accounts) ListAdminAuditLogs(tournamentID string, limit int) ([]AdminAuditLog, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var list []AdminAuditLog
	if s.db != nil {
		query := `SELECT id, admin_user, action, COALESCE(tournament_id, ''), COALESCE(match_id, ''), COALESCE(details, '{}'::jsonb), created_at FROM arena_admin_audit_logs`
		var args []interface{}
		if tournamentID != "" {
			query += ` WHERE tournament_id = $1`
			args = append(args, tournamentID)
		}
		query += ` ORDER BY created_at DESC LIMIT $` + fmt.Sprintf("%d", len(args)+1)
		args = append(args, limit)

		rows, err := s.db.Query(query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var logEntry AdminAuditLog
			var detailsRaw []byte
			if err := rows.Scan(&logEntry.ID, &logEntry.AdminUser, &logEntry.Action, &logEntry.TournamentID, &logEntry.MatchID, &detailsRaw, &logEntry.CreatedAt); err != nil {
				return nil, err
			}
			_ = json.Unmarshal(detailsRaw, &logEntry.Details)
			list = append(list, logEntry)
		}
		return list, rows.Err()
	}

	for _, entry := range s.adminLogs {
		if tournamentID == "" || entry.TournamentID == tournamentID {
			list = append(list, entry)
		}
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.After(list[j].CreatedAt)
	})
	if len(list) > limit {
		list = list[:limit]
	}
	return list, nil
}
