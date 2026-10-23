package websocket

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"project-tuan3/internal/auth"
)

func rtcServer(t *testing.T) (*httptest.Server, func(role, side, match, name string) *websocket.Conn) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	hub := NewRTCHub()
	engine := gin.New()
	engine.GET("/ws/rtc/:id/:matchId", func(c *gin.Context) {
		// Giả lập middleware phiên của main.go: phiên đội phải khớp trận trong URL.
		session := auth.Session{Role: c.Query("role"), Side: c.Query("side"), MatchID: c.Query("session_match"), TeamName: c.Query("name")}
		if session.Role == "TEAM" && session.MatchID != c.Param("matchId") {
			c.AbortWithStatus(403)
			return
		}
		c.Set("session", session)
		hub.Serve(c, "*")
	})
	srv := httptest.NewServer(engine)
	t.Cleanup(srv.Close)
	dial := func(role, side, match, name string) *websocket.Conn {
		url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/rtc/t1/" + match + "?role=" + role + "&side=" + side + "&session_match=" + match + "&name=" + name
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			t.Fatalf("dial %s/%s: %v", role, side, err)
		}
		t.Cleanup(func() { conn.Close() })
		return conn
	}
	return srv, dial
}

func readType(t *testing.T, conn *websocket.Conn, want string) map[string]interface{} {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			continue
		}
		var msg map[string]interface{}
		_ = json.Unmarshal(raw, &msg)
		if msg["type"] == want {
			return msg
		}
	}
	t.Fatalf("không nhận được thông điệp %q", want)
	return nil
}

func selfID(msg map[string]interface{}) string {
	return msg["self"].(map[string]interface{})["id"].(string)
}

func TestRTCAdminRelaysToTeamButTeamsAreIsolatedUntilAllowed(t *testing.T) {
	_, dial := rtcServer(t)
	admin := dial("ADMIN", "", "m1", "x")
	adminID := selfID(readType(t, admin, "welcome"))
	a := dial("TEAM", "team_a", "m1", "A")
	aID := selfID(readType(t, a, "welcome"))
	b := dial("TEAM", "team_b", "m1", "B")
	bID := selfID(readType(t, b, "welcome"))

	// Admin -> đội A: được chuyển tiếp kèm vai trò người gửi.
	_ = admin.WriteJSON(map[string]interface{}{"type": "offer", "to": aID, "role": "offerer", "data": map[string]string{"sdp": "x"}})
	got := readType(t, a, "offer")
	if got["from"] != adminID || got["role"] != "offerer" {
		t.Fatalf("offer sai nguồn: %v", got)
	}
	// Đội A -> đội B khi chưa được phép: bị từ chối.
	_ = a.WriteJSON(map[string]interface{}{"type": "offer", "to": bID, "data": 1})
	readType(t, a, "error")

	// Chỉ admin được bật; đội gửi lệnh sẽ nhận lỗi.
	_ = a.WriteJSON(map[string]interface{}{"type": "allow-opponent", "value": true})
	readType(t, a, "error")
	_ = admin.WriteJSON(map[string]interface{}{"type": "allow-opponent", "value": true})
	readType(t, b, "allow-opponent")

	_ = a.WriteJSON(map[string]interface{}{"type": "offer", "to": bID, "role": "offerer", "data": 1})
	if from := readType(t, b, "offer")["from"]; from != aID {
		t.Fatalf("offer đội A->B sai nguồn: %v", from)
	}
}

func TestRTCTeamCannotEnterAnotherMatchOrWithoutSide(t *testing.T) {
	srv, dial := rtcServer(t)
	_ = dial
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/rtc/t1/m2?role=TEAM&side=team_a&session_match=m1"
	if _, resp, err := websocket.DefaultDialer.Dial(url, nil); err == nil || resp == nil || resp.StatusCode != 403 {
		t.Fatalf("đội trận khác phải bị từ chối 403, err=%v resp=%v", err, resp)
	}
	url = "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/rtc/t1/m1?role=TEAM&session_match=m1"
	if _, resp, err := websocket.DefaultDialer.Dial(url, nil); err == nil || resp == nil || resp.StatusCode != 403 {
		t.Fatalf("đội chưa có phe phải bị từ chối 403, err=%v resp=%v", err, resp)
	}
}

func TestRTCPeerLeftIsAnnounced(t *testing.T) {
	_, dial := rtcServer(t)
	admin := dial("ADMIN", "", "m1", "x")
	readType(t, admin, "welcome")
	a := dial("TEAM", "team_a", "m1", "A")
	aID := selfID(readType(t, a, "welcome"))
	readType(t, admin, "peer-joined")
	a.Close()
	if id := readType(t, admin, "peer-left")["id"]; id != aID {
		t.Fatalf("peer-left sai: %v", id)
	}
}
