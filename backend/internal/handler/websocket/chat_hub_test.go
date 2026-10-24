package websocket

import (
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"project-tuan3/internal/auth"
)

type memChat struct {
	mu   sync.Mutex
	rows map[string][]byte
}

func (m *memChat) Get(key string, target interface{}) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	raw, ok := m.rows[key]
	if !ok {
		return sql.ErrNoRows
	}
	return json.Unmarshal(raw, target)
}

func (m *memChat) Batch(values map[string]interface{}) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, v := range values {
		raw, _ := json.Marshal(v)
		m.rows[k] = raw
	}
	return nil
}

func chatServer(t *testing.T, store ChatStore) func(role, side, name string) *websocket.Conn {
	t.Helper()
	gin.SetMode(gin.TestMode)
	hub := NewChatHub(store)
	engine := gin.New()
	engine.GET("/ws/chat/:id/:matchId", func(c *gin.Context) {
		c.Set("session", auth.Session{Role: c.Query("role"), Side: c.Query("side"), TeamName: c.Query("name")})
		hub.Serve(c, "*")
	})
	srv := httptest.NewServer(engine)
	t.Cleanup(srv.Close)
	return func(role, side, name string) *websocket.Conn {
		url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/chat/t1/m1?role=" + role + "&side=" + side + "&name=" + name
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			t.Fatalf("dial %s: %v", role, err)
		}
		t.Cleanup(func() { conn.Close() })
		return conn
	}
}

func TestChatDeliversToOpponentAndAdminAndKeepsHistory(t *testing.T) {
	store := &memChat{rows: map[string][]byte{}}
	dial := chatServer(t, store)
	a := dial("TEAM", "team_a", "Do")
	readType(t, a, "hello")
	b := dial("TEAM", "team_b", "Xanh")
	readType(t, b, "hello")
	admin := dial("ADMIN", "", "x")
	readType(t, admin, "hello")

	_ = a.WriteJSON(map[string]string{"type": "msg", "text": "  chào đối thủ \n", "cid": "c1"})
	for _, c := range []*websocket.Conn{a, b, admin} {
		m := readType(t, c, "msg")["message"].(map[string]interface{})
		if m["text"] != "chào đối thủ" || m["side"] != "team_a" || m["name"] != "Do" {
			t.Fatalf("tin nhắn sai: %v", m)
		}
	}
	// người vào sau nhận lại lịch sử
	late := dial("TEAM", "team_b", "Xanh")
	hello := readType(t, late, "hello")
	if msgs := hello["messages"].([]interface{}); len(msgs) != 1 {
		t.Fatalf("lịch sử = %d, muốn 1", len(msgs))
	}
	if _, ok := store.rows["chat:t1/m1"]; !ok {
		t.Fatal("lịch sử chưa được lưu vào kho")
	}
}

func TestChatMuteBlocksTeamsOnlyAndOnlyAdminCanMute(t *testing.T) {
	dial := chatServer(t, &memChat{rows: map[string][]byte{}})
	a := dial("TEAM", "team_a", "Do")
	readType(t, a, "hello")
	admin := dial("ADMIN", "", "x")
	readType(t, admin, "hello")

	_ = a.WriteJSON(map[string]interface{}{"type": "mute", "value": true})
	readType(t, a, "error")

	_ = admin.WriteJSON(map[string]interface{}{"type": "mute", "value": true})
	readType(t, a, "muted")
	_ = a.WriteJSON(map[string]string{"type": "msg", "text": "hi"})
	readType(t, a, "error")
	_ = admin.WriteJSON(map[string]string{"type": "msg", "text": "thông báo"})
	readType(t, a, "msg")
}

func TestChatRateLimitAndLengthCap(t *testing.T) {
	dial := chatServer(t, &memChat{rows: map[string][]byte{}})
	a := dial("TEAM", "team_a", "Do")
	readType(t, a, "hello")
	_ = a.WriteJSON(map[string]string{"type": "msg", "text": strings.Repeat("a", 900)})
	m := readType(t, a, "msg")["message"].(map[string]interface{})
	if n := len([]rune(m["text"].(string))); n != chatMaxText {
		t.Fatalf("độ dài = %d, muốn %d", n, chatMaxText)
	}
	for i := 0; i < chatBurst+2; i++ {
		_ = a.WriteJSON(map[string]string{"type": "msg", "text": "spam"})
	}
	readType(t, a, "error")
}

func TestChatRejectsTeamWithoutSide(t *testing.T) {
	gin.SetMode(gin.TestMode)
	hub := NewChatHub(nil)
	engine := gin.New()
	engine.GET("/c", func(c *gin.Context) {
		c.Set("session", auth.Session{Role: "TEAM"})
		hub.Serve(c, "*")
	})
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest("GET", "/c", nil))
	if rec.Code != 403 {
		t.Fatalf("mã = %d, muốn 403", rec.Code)
	}
}
