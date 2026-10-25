package http

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

// Giấy chứng nhận: tính từ kết quả sơ đồ loại trực tiếp (chung kết, bán kết).
// Khi chung kết có kết quả, mỗi đội đạt giải nhận một thông báo (mỗi giải/đội đúng một lần)
// và xem/tải giấy trong "Kho giấy chứng nhận" ở Hồ sơ đội.

type CertificateStore interface {
	Get(key string, target interface{}) error
	Batch(values map[string]interface{}) error
}

type CertificateSettings struct {
	Org      string `json:"org"`
	Signer   string `json:"signer"`
	Date     string `json:"date"`
	IssuedAt int64  `json:"issued_at"`
}

type Certificate struct {
	TournamentID   string `json:"tournament_id"`
	TournamentName string `json:"tournament_name"`
	Place          string `json:"place"`
	Rank           int    `json:"rank"`
	TeamName       string `json:"team_name"`
	StudentID      string `json:"student_id"`
	CertificateSettings
}

type CertificateHandler struct {
	Service  *service.TournamentService
	Accounts *repository.Accounts
	Store    CertificateStore
	// TechWinner trả đội nhận Giải Kỹ thuật của giải chính AI (chỉ sau khi điểm báo cáo được công bố).
	TechWinner func(tid string) (teamName, studentID string, score float64, ok bool)
}

func certKey(tid string) string { return "certcfg:" + tid }

func asLevel(v interface{}) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return 0
}

type placement struct {
	Place, TeamName, StudentID string
	Rank                       int
}

// placementsOf: Quán quân, Á quân (chung kết) và Đồng hạng Ba (hai đội thua bán kết).
func placementsOf(t map[string]interface{}) []placement {
	matches, _ := t["matches"].(map[string]interface{})
	top := 0
	for _, raw := range matches {
		if m, ok := raw.(map[string]interface{}); ok && asLevel(m["round_level"]) > top {
			top = asLevel(m["round_level"])
		}
	}
	if top == 0 {
		return nil
	}
	team := func(m map[string]interface{}, side string) (string, string) {
		t, _ := m[side].(map[string]interface{})
		return strings.TrimSpace(fmt.Sprint(t["team_name"])), strings.TrimSpace(fmt.Sprint(t["student_id"]))
	}
	other := map[string]string{"team_a": "team_b", "team_b": "team_a"}
	var out []placement
	add := func(place string, rank int, m map[string]interface{}, side string) {
		name, sid := team(m, side)
		if name != "" && name != "<nil>" && sid != "<nil>" {
			out = append(out, placement{place, name, sid, rank})
		}
	}
	var semis []map[string]interface{}
	for _, raw := range matches {
		m, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		w, _ := m["winner"].(string)
		if other[w] == "" {
			continue
		}
		switch asLevel(m["round_level"]) {
		case top:
			add("Quán quân", 1, m, w)
			add("Á quân", 2, m, other[w])
		case top - 1:
			semis = append(semis, m)
		}
	}
	if len(out) == 0 { // chung kết chưa xong thì chưa có giấy nào
		return nil
	}
	for _, m := range semis {
		w, _ := m["winner"].(string)
		add("Đồng hạng Ba", 3, m, other[w])
	}
	return out
}

func (h *CertificateHandler) settings(tid string) (CertificateSettings, bool) {
	var s CertificateSettings
	if h.Store == nil {
		return s, false
	}
	err := h.Store.Get(certKey(tid), &s)
	return s, err == nil
}

func defaultSettings() CertificateSettings {
	now := time.Now().In(time.FixedZone("ICT", 7*3600))
	return CertificateSettings{Org: "BOT K69 ARENA", Date: now.Format("02/01/2006"), IssuedAt: now.Unix()}
}

// Issue gửi thông báo giấy chứng nhận cho các đội đạt giải của một giải (an toàn khi gọi nhiều lần).
func (h *CertificateHandler) Issue(tid string) (int, error) {
	t, err := h.Service.GetTournamentByID(tid)
	if err != nil {
		return 0, err
	}
	items := h.allPlacements(tid, t)
	if len(items) == 0 {
		return 0, nil
	}
	if _, ok := h.settings(tid); !ok && h.Store != nil {
		if err := h.Store.Batch(map[string]interface{}{certKey(tid): defaultSettings()}); err != nil {
			return 0, err
		}
	}
	name := fmt.Sprint(t["name"])
	sent := 0
	for _, p := range items {
		if p.StudentID == "" {
			continue
		}
		err := h.Accounts.CreateNotification(repository.Notification{
			RecipientID: p.StudentID,
			EventType:   "CERTIFICATE",
			Title:       "Giấy chứng nhận " + p.Place,
			Message:     "Chúc mừng đội " + p.TeamName + " đạt " + p.Place + " tại " + name + ". Xem và tải giấy chứng nhận trong Hồ sơ đội.",
			LinkTab:     "profile",
			LinkData:    map[string]interface{}{"tournament_id": tid, "section": "certificates"},
			DedupKey:    certDedup(tid, p),
		})
		if err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}

// IssueAsync dùng trong các sự kiện kết thúc hiệp: không chặn luồng chấm.
func (h *CertificateHandler) IssueAsync(tid string) {
	go func() {
		if _, err := h.Issue(tid); err != nil {
			log.Printf("[Certificates] issue %s: %v", tid, err)
		}
	}()
}

// allPlacements: hạng ở sơ đồ và, với giải chính AI, cả Giải Kỹ thuật (khi đã công bố).
func (h *CertificateHandler) allPlacements(tid string, t map[string]interface{}) []placement {
	items := placementsOf(t)
	if tournamentTrack(t) == "AI" && h.TechWinner != nil {
		if name, sid, _, ok := h.TechWinner(tid); ok {
			items = append(items, placement{Place: aiTechAwardName, TeamName: name, StudentID: sid, Rank: 1})
		}
	}
	return items
}

func certDedup(tid string, p placement) string {
	if p.Place == aiTechAwardName {
		return "cert:tech:" + tid + ":" + strings.ToUpper(p.StudentID)
	}
	return "cert:" + tid + ":" + strings.ToUpper(p.StudentID)
}

func (h *CertificateHandler) build(tid string, t map[string]interface{}) []Certificate {
	items := h.allPlacements(tid, t)
	if len(items) == 0 {
		return nil
	}
	s, ok := h.settings(tid)
	if !ok {
		s = defaultSettings()
	}
	out := make([]Certificate, 0, len(items))
	for _, p := range items {
		out = append(out, Certificate{TournamentID: tid, TournamentName: fmt.Sprint(t["name"]), Place: p.Place, Rank: p.Rank, TeamName: p.TeamName, StudentID: p.StudentID, CertificateSettings: s})
	}
	return out
}

// List: GET /api/certificates — đội thấy giấy của mình ở mọi giải; admin xem theo ?tournament_id.
func (h *CertificateHandler) List(c *gin.Context) {
	s := requestSession(c)
	var out []Certificate
	if s.Role == "ADMIN" {
		tid := c.Query("tournament_id")
		t, err := h.Service.GetTournamentByID(tid)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy giải."})
			return
		}
		out = h.build(tid, t)
	} else if s.Role == "TEAM" && s.StudentID != "" {
		for tid, raw := range h.Service.GetAllTournaments() {
			t, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			for _, cert := range h.build(tid, t) {
				if strings.EqualFold(cert.StudentID, s.StudentID) {
					out = append(out, cert)
				}
			}
		}
	} else {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Cần đăng nhập đội để xem giấy chứng nhận."})
		return
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].IssuedAt != out[j].IssuedAt {
			return out[i].IssuedAt > out[j].IssuedAt
		}
		return out[i].Rank < out[j].Rank
	})
	if out == nil {
		out = []Certificate{}
	}
	c.JSON(http.StatusOK, gin.H{"items": out})
}

// Save: PUT /api/tournaments/:id/certificates — admin chỉnh đơn vị, người ký, ngày rồi gửi thông báo cho các đội.
func (h *CertificateHandler) Save(c *gin.Context) {
	tid := c.Param("id")
	var body struct {
		Org    string `json:"org"`
		Signer string `json:"signer"`
		Date   string `json:"date"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Dữ liệu không hợp lệ."})
		return
	}
	clip := func(s string, n int) string {
		s = strings.TrimSpace(s)
		if r := []rune(s); len(r) > n {
			s = string(r[:n])
		}
		return s
	}
	t, err := h.Service.GetTournamentByID(tid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy giải."})
		return
	}
	if len(h.allPlacements(tid, t)) == 0 {
		c.JSON(http.StatusConflict, gin.H{"detail": "Chung kết chưa có kết quả nên chưa cấp giấy chứng nhận."})
		return
	}
	s, ok := h.settings(tid)
	if !ok {
		s = defaultSettings()
	}
	s.Org, s.Signer, s.Date = clip(body.Org, 120), clip(body.Signer, 80), clip(body.Date, 40)
	if s.Org == "" {
		s.Org = "BOT K69 ARENA"
	}
	if err := h.Store.Batch(map[string]interface{}{certKey(tid): s}); err != nil && !errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không lưu được thông tin giấy chứng nhận."})
		return
	}
	sent, err := h.Issue(tid)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Đã lưu nhưng chưa gửi được thông báo."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": h.build(tid, t), "notified": sent})
}
