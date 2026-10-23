package http

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/qualifier"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

// SimilarityHandler: báo cáo các cặp bài nộp có mã nguồn giống nhau cho ban tổ chức xem xét.
// Không tự động xử phạt — chỉ hỗ trợ con người ra quyết định.
type SimilarityHandler struct {
	Store       *repository.QualifierRecords
	Qualifiers  *qualifier.Service
	Tournaments *service.TournamentService
}

type simDoc struct {
	service.SimilarityDoc
	SubmittedAt float64 `json:"submitted_at,omitempty"`
}

func (h *SimilarityHandler) documents(source, id string) ([]simDoc, error) {
	docs := []simDoc{}
	switch source {
	case "qualifier":
		people, err := h.Qualifiers.Participants(id)
		if err != nil {
			return nil, err
		}
		for _, p := range people {
			if strings.TrimSpace(p.Code) != "" && !p.TestBot {
				docs = append(docs, simDoc{service.SimilarityDoc{ID: p.SID, Name: p.Name, Language: p.Language, Code: p.Code}, p.SubmittedAt})
			}
		}
	case "tournament":
		t, err := h.Tournaments.GetTournamentByID(id)
		if err != nil {
			return nil, err
		}
		latest := map[string]simDoc{}
		matches, _ := t["matches"].(map[string]interface{})
		for _, raw := range matches {
			m, _ := raw.(map[string]interface{})
			for _, side := range []string{"team_a", "team_b"} {
				team, _ := m[side].(map[string]interface{})
				code, _ := team["current_code"].(string)
				sid, _ := team["student_id"].(string)
				if strings.TrimSpace(code) == "" || sid == "" {
					continue
				}
				name, _ := team["team_name"].(string)
				lang, _ := team["current_lang"].(string)
				level, _ := m["round_level"].(float64)
				// Giữ bài ở vòng sâu nhất của mỗi đội (bài gần đây nhất).
				if prev, ok := latest[sid]; !ok || level >= prev.SubmittedAt {
					latest[sid] = simDoc{service.SimilarityDoc{ID: sid, Name: name, Language: lang, Code: code}, level}
				}
			}
		}
		for _, d := range latest {
			d.SubmittedAt = 0
			docs = append(docs, d)
		}
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].ID < docs[j].ID })
	return docs, nil
}

func pairKey(source, id, a, b string) string {
	if a > b {
		a, b = b, a
	}
	return "simreview:" + source + ":" + id + ":" + a + "|" + b
}

func (h *SimilarityHandler) sourceParams(c *gin.Context) (string, string, bool) {
	source, id := c.Query("source"), c.Query("id")
	if (source != "qualifier" && source != "tournament") || id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Chọn nguồn (vòng loại hoặc giải) cần kiểm tra."})
		return "", "", false
	}
	return source, id, true
}

func (h *SimilarityHandler) Report(c *gin.Context) {
	source, id, ok := h.sourceParams(c)
	if !ok {
		return
	}
	min, err := strconv.ParseFloat(c.DefaultQuery("min", "0.7"), 64)
	if err != nil || min < 0 || min > 1 {
		min = 0.7
	}
	cacheKey := "sim:" + source + ":" + id + ":" + strconv.FormatFloat(min, 'f', 2, 64)
	if cached, hit := derivedGet(cacheKey); hit {
		c.JSON(http.StatusOK, cached)
		return
	}
	version := derivedVersion()
	docs, err := h.documents(source, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	plain := make([]service.SimilarityDoc, len(docs))
	byID := map[string]simDoc{}
	for i, d := range docs {
		plain[i] = d.SimilarityDoc
		byID[d.ID] = d
	}
	pairs := service.CompareAll(plain, min, 200)
	reviews, _ := h.Store.List("simreview:" + source + ":" + id + ":")
	items := make([]gin.H, 0, len(pairs))
	for _, p := range pairs {
		a, b := byID[p.A], byID[p.B]
		item := gin.H{
			"a":     gin.H{"student_id": a.ID, "team_name": a.Name, "language": a.Language, "submitted_at": a.SubmittedAt},
			"b":     gin.H{"student_id": b.ID, "team_name": b.Name, "language": b.Language, "submitted_at": b.SubmittedAt},
			"score": p.Score, "containment": p.Containment, "shared": p.Shared,
		}
		if raw, ok := reviews[pairKey(source, id, a.ID, b.ID)]; ok {
			var review map[string]interface{}
			if json.Unmarshal(raw, &review) == nil {
				item["review"] = review
			}
		}
		items = append(items, item)
	}
	response := gin.H{"pairs": items, "documents": len(docs), "min": min, "generated_at": time.Now().UTC()}
	derivedSet(cacheKey, version, response)
	c.JSON(http.StatusOK, response)
}

func (h *SimilarityHandler) Pair(c *gin.Context) {
	source, id, ok := h.sourceParams(c)
	if !ok {
		return
	}
	docs, err := h.documents(source, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	want := map[string]bool{c.Query("a"): true, c.Query("b"): true}
	out := gin.H{}
	for _, d := range docs {
		if want[d.ID] {
			key := "b"
			if d.ID == c.Query("a") {
				key = "a"
			}
			out[key] = gin.H{"student_id": d.ID, "team_name": d.Name, "language": d.Language, "code": d.Code}
		}
	}
	if len(out) != 2 {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy bài của một trong hai đội."})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, out)
}

func (h *SimilarityHandler) Review(c *gin.Context) {
	var req struct {
		Source string `json:"source"`
		ID     string `json:"id"`
		A      string `json:"a"`
		B      string `json:"b"`
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if c.ShouldBindJSON(&req) != nil || req.A == "" || req.B == "" || req.ID == "" || (req.Source != "qualifier" && req.Source != "tournament") {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Thiếu thông tin cặp bài."})
		return
	}
	status := strings.ToUpper(req.Status)
	if status != "CLEARED" && status != "SUSPECT" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Trạng thái là CLEARED (không vấn đề) hoặc SUSPECT (nghi vấn)."})
		return
	}
	if len([]rune(req.Note)) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Ghi chú tối đa 500 ký tự."})
		return
	}
	review := gin.H{"status": status, "note": strings.TrimSpace(req.Note), "by": requestSession(c).Actor(), "at": time.Now().UTC()}
	if err := h.Store.Batch(map[string]interface{}{pairKey(req.Source, req.ID, req.A, req.B): review}); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được đánh giá."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "review": review})
}
