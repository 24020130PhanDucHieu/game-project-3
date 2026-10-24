package websocket

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"project-tuan3/internal/auth"
)

// ChatHub: phòng chat của một trận. Thành viên: hai đội của trận và ban tổ chức (qua requireSession).
// Lịch sử lưu trong kho bản ghi (Postgres/JSON) nên còn nguyên sau khi gateway khởi động lại.
const (
	chatMaxText    = 500
	chatMaxHistory = 200
	chatMaxPeers   = 24
	chatReadLimit  = 4 * 1024
	chatMinGap     = 600 * time.Millisecond
	chatBurst      = 5
	chatWriteWait  = 5 * time.Second
	chatPongWait   = 70 * time.Second
	chatPingEvery  = 25 * time.Second
	chatSendBuffer = 64
)

// ChatStore là phần của kho bản ghi mà phòng chat cần.
type ChatStore interface {
	Get(key string, target interface{}) error
	Batch(values map[string]interface{}) error
}

type ChatMessage struct {
	ID   string `json:"id"`
	TS   int64  `json:"ts"`
	Role string `json:"role"`
	Side string `json:"side,omitempty"`
	Name string `json:"name"`
	Text string `json:"text"`
}

type chatRecord struct {
	Messages []ChatMessage `json:"messages"`
	Muted    bool          `json:"muted"`
}

type chatPeer struct {
	id   string
	role string
	side string
	name string
	conn *websocket.Conn
	send chan []byte
	once sync.Once
	// chống spam: xô token đơn giản
	tokens float64
	last   time.Time
}

type chatRoom struct {
	key       string
	mu        sync.Mutex
	persistMu sync.Mutex
	peers     map[string]*chatPeer
	rec       chatRecord
	loaded    bool
}

type ChatHub struct {
	store ChatStore
	mu    sync.Mutex
	rooms map[string]*chatRoom
}

func NewChatHub(store ChatStore) *ChatHub {
	return &ChatHub{store: store, rooms: map[string]*chatRoom{}}
}

func chatStoreKey(room string) string { return "chat:" + room }

func (h *ChatHub) room(key string) *chatRoom {
	h.mu.Lock()
	r, ok := h.rooms[key]
	if !ok {
		r = &chatRoom{key: key, peers: map[string]*chatPeer{}}
		h.rooms[key] = r
	}
	h.mu.Unlock()
	r.mu.Lock()
	if !r.loaded {
		var rec chatRecord
		if h.store != nil {
			if err := h.store.Get(chatStoreKey(key), &rec); err != nil && !errors.Is(err, sql.ErrNoRows) {
				log.Println("[Chat] load:", err)
			}
		}
		r.rec, r.loaded = rec, true
	}
	r.mu.Unlock()
	return r
}

// release bỏ phòng rỗng khỏi bộ nhớ (lịch sử vẫn nằm trong kho).
func (h *ChatHub) release(key string, r *chatRoom) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r.mu.Lock()
	empty := len(r.peers) == 0
	r.mu.Unlock()
	if empty && h.rooms[key] == r {
		delete(h.rooms, key)
	}
}

func (p *chatPeer) enqueue(v interface{}) {
	raw, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case p.send <- raw:
	default:
		// người nhận quá chậm: ngắt để họ kết nối lại và nhận lại lịch sử đầy đủ
		p.close()
	}
}

func (p *chatPeer) close() {
	p.once.Do(func() { _ = p.conn.Close() })
}

func (r *chatRoom) broadcast(v interface{}) {
	r.mu.Lock()
	list := make([]*chatPeer, 0, len(r.peers))
	for _, p := range r.peers {
		list = append(list, p)
	}
	r.mu.Unlock()
	for _, p := range list {
		p.enqueue(v)
	}
}

type chatWho struct {
	Role string `json:"role"`
	Side string `json:"side,omitempty"`
	Name string `json:"name"`
}

func (r *chatRoom) online() []chatWho {
	r.mu.Lock()
	defer r.mu.Unlock()
	seen := map[string]bool{}
	out := []chatWho{}
	for _, p := range r.peers {
		k := p.role + "/" + p.side
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, chatWho{Role: p.role, Side: p.side, Name: p.name})
	}
	return out
}

func (h *ChatHub) persist(r *chatRoom) {
	if h.store == nil {
		return
	}
	r.persistMu.Lock()
	defer r.persistMu.Unlock()
	r.mu.Lock()
	rec := chatRecord{Messages: append([]ChatMessage(nil), r.rec.Messages...), Muted: r.rec.Muted}
	r.mu.Unlock()
	if err := h.store.Batch(map[string]interface{}{chatStoreKey(r.key): rec}); err != nil {
		log.Println("[Chat] persist:", err)
	}
}

// cleanChatText bỏ ký tự điều khiển, gộp khoảng trắng đầu/cuối, cắt theo số ký tự.
func cleanChatText(s string) string {
	s = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' {
			return ' '
		}
		if unicode.IsControl(r) || r == utf8.RuneError {
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > chatMaxText {
		s = string([]rune(s)[:chatMaxText])
	}
	return s
}

func (p *chatPeer) allow() bool {
	now := time.Now()
	if p.last.IsZero() {
		p.tokens = chatBurst
	} else {
		p.tokens += float64(now.Sub(p.last)) / float64(chatMinGap)
		if p.tokens > chatBurst {
			p.tokens = chatBurst
		}
	}
	p.last = now
	if p.tokens < 1 {
		return false
	}
	p.tokens--
	return true
}

func (h *ChatHub) Serve(c *gin.Context, allowedOrigins string) {
	value, ok := c.Get("session")
	session, isSession := value.(auth.Session)
	if !ok || !isSession {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Cần đăng nhập để vào phòng chat."})
		return
	}
	peer := &chatPeer{id: newPeerID(), role: session.Role, name: session.TeamName}
	switch session.Role {
	case rtcRoleAdmin:
		peer.name = "Ban tổ chức"
	case rtcRoleTeam:
		if session.Side != "team_a" && session.Side != "team_b" {
			c.JSON(http.StatusForbidden, gin.H{"detail": "Hãy vào phòng trận của đội trước khi chat."})
			return
		}
		peer.side = session.Side
	default:
		c.JSON(http.StatusForbidden, gin.H{"detail": "Vai trò này không được chat."})
		return
	}
	key := c.Param("id") + "/" + c.Param("matchId")
	room := h.room(key)

	room.mu.Lock()
	full := len(room.peers) >= chatMaxPeers
	room.mu.Unlock()
	if full {
		h.release(key, room)
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Phòng chat đã đầy."})
		return
	}

	upgrader := newUpgrader(allowedOrigins)
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.release(key, room)
		log.Println("[Chat] upgrade:", err)
		return
	}
	conn.SetReadLimit(chatReadLimit)
	_ = conn.SetReadDeadline(time.Now().Add(chatPongWait))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(chatPongWait)) })
	peer.conn = conn
	peer.send = make(chan []byte, chatSendBuffer)

	go func() {
		ticker := time.NewTicker(chatPingEvery)
		defer func() { ticker.Stop(); peer.close() }()
		for {
			select {
			case msg, ok := <-peer.send:
				_ = conn.SetWriteDeadline(time.Now().Add(chatWriteWait))
				if !ok || conn.WriteMessage(websocket.TextMessage, msg) != nil {
					return
				}
			case <-ticker.C:
				if conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(chatWriteWait)) != nil {
					return
				}
			}
		}
	}()

	room.mu.Lock()
	room.peers[peer.id] = peer
	history := append([]ChatMessage{}, room.rec.Messages...)
	muted := room.rec.Muted
	room.mu.Unlock()

	peer.enqueue(gin.H{"type": "hello", "self": chatWho{Role: peer.role, Side: peer.side, Name: peer.name}, "messages": history, "muted": muted, "online": room.online()})
	room.broadcast(gin.H{"type": "presence", "online": room.online()})

	defer func() {
		room.mu.Lock()
		delete(room.peers, peer.id)
		room.mu.Unlock()
		room.broadcast(gin.H{"type": "presence", "online": room.online()})
		peer.close()
		h.release(key, room)
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var msg struct {
			Type  string `json:"type"`
			Text  string `json:"text"`
			Value bool   `json:"value"`
			CID   string `json:"cid"`
		}
		if json.Unmarshal(raw, &msg) != nil {
			continue
		}
		switch msg.Type {
		case "msg":
			text := cleanChatText(msg.Text)
			if text == "" {
				continue
			}
			room.mu.Lock()
			blocked := room.rec.Muted && peer.role != rtcRoleAdmin
			room.mu.Unlock()
			if blocked {
				peer.enqueue(gin.H{"type": "error", "cid": msg.CID, "detail": "Ban tổ chức đang tạm khóa chat của các đội."})
				continue
			}
			if !peer.allow() {
				peer.enqueue(gin.H{"type": "error", "cid": msg.CID, "detail": "Bạn gửi quá nhanh, chờ một chút."})
				continue
			}
			m := ChatMessage{ID: newPeerID(), TS: time.Now().UnixMilli(), Role: peer.role, Side: peer.side, Name: peer.name, Text: text}
			room.mu.Lock()
			room.rec.Messages = append(room.rec.Messages, m)
			if over := len(room.rec.Messages) - chatMaxHistory; over > 0 {
				room.rec.Messages = append([]ChatMessage(nil), room.rec.Messages[over:]...)
			}
			room.mu.Unlock()
			room.broadcast(gin.H{"type": "msg", "message": m, "cid": msg.CID, "from": peer.id})
			h.persist(room)
		case "mute":
			if peer.role != rtcRoleAdmin {
				peer.enqueue(gin.H{"type": "error", "detail": "Chỉ ban tổ chức được khóa chat."})
				continue
			}
			room.mu.Lock()
			room.rec.Muted = msg.Value
			room.mu.Unlock()
			room.broadcast(gin.H{"type": "muted", "value": msg.Value})
			h.persist(room)
		case "clear":
			if peer.role != rtcRoleAdmin {
				peer.enqueue(gin.H{"type": "error", "detail": "Chỉ ban tổ chức được xóa lịch sử chat."})
				continue
			}
			room.mu.Lock()
			room.rec.Messages = nil
			room.mu.Unlock()
			room.broadcast(gin.H{"type": "cleared"})
			h.persist(room)
		}
	}
}
