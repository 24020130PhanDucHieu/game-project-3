package websocket

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"project-tuan3/internal/auth"
)

// RTCHub chỉ chuyển tiếp thông điệp "tín hiệu" WebRTC (offer/answer/ice) giữa các thành viên cùng một trận.
// Video đi trực tiếp giữa trình duyệt (P2P); máy chủ không nhận, không ghi và không lưu hình ảnh.
//
// Quyền xem (theo yêu cầu): Admin liên lạc được với mọi đội; hai đội chỉ liên lạc với nhau khi Admin bật allow_opponent.
const (
	rtcMaxMessage  = 16 * 1024
	rtcMaxPeers    = 12
	rtcRatePerSec  = 200
	rtcWriteWait   = 5 * time.Second
	rtcPongWait    = 70 * time.Second
	rtcPingEvery   = 25 * time.Second
	rtcSendBuffer  = 64
	rtcRoleAdmin   = "ADMIN"
	rtcRoleTeam    = "TEAM"
	rtcTypeAllow   = "allow-opponent"
	rtcTypeWelcome = "welcome"
)

type rtcPeerInfo struct {
	ID   string `json:"id"`
	Role string `json:"role"`
	Side string `json:"side,omitempty"`
	Name string `json:"name,omitempty"`
}

type rtcPeer struct {
	rtcPeerInfo
	conn *websocket.Conn
	send chan []byte
	room *rtcRoom
	once sync.Once
}

type rtcRoom struct {
	mu            sync.Mutex
	peers         map[string]*rtcPeer
	allowOpponent bool
}

type RTCHub struct {
	mu    sync.Mutex
	rooms map[string]*rtcRoom
}

func NewRTCHub() *RTCHub { return &RTCHub{rooms: map[string]*rtcRoom{}} }

func (h *RTCHub) room(key string) *rtcRoom {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[key]
	if !ok {
		r = &rtcRoom{peers: map[string]*rtcPeer{}}
		h.rooms[key] = r
	}
	return r
}

func (h *RTCHub) release(key string, r *rtcRoom) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r.mu.Lock()
	empty := len(r.peers) == 0
	r.mu.Unlock()
	if empty && h.rooms[key] == r {
		delete(h.rooms, key)
	}
}

func newPeerID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// canRelay quyết định hai thành viên có được trao đổi tín hiệu không.
func canRelay(a, b rtcPeerInfo, allowOpponent bool) bool {
	if a.ID == b.ID {
		return false
	}
	if a.Role == rtcRoleAdmin || b.Role == rtcRoleAdmin {
		return true
	}
	return allowOpponent && a.Role == rtcRoleTeam && b.Role == rtcRoleTeam && a.Side != "" && b.Side != "" && a.Side != b.Side
}

func (p *rtcPeer) enqueue(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case p.send <- data:
	default:
		// Hàng đợi đầy: ngắt kết nối chậm thay vì chặn cả phòng.
		p.close()
	}
}

func (p *rtcPeer) close() {
	p.once.Do(func() { _ = p.conn.Close() })
}

func (r *rtcRoom) broadcast(except string, v interface{}) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, p := range r.peers {
		if id != except {
			p.enqueue(v)
		}
	}
}

// Serve nâng cấp kết nối và chạy vòng lặp tín hiệu. Phiên đã được kiểm tra bởi middleware (token trong ?token=);
// phiên đội chỉ vào đúng giải/trận của mình, Admin vào được mọi trận.
func (h *RTCHub) Serve(c *gin.Context, allowedOrigins string) {
	value, ok := c.Get("session")
	session, isSession := value.(auth.Session)
	if !ok || !isSession {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Cần đăng nhập để vào phòng webcam."})
		return
	}
	info := rtcPeerInfo{ID: newPeerID(), Role: session.Role, Name: session.TeamName}
	switch session.Role {
	case rtcRoleAdmin:
		info.Name = "Ban tổ chức"
	case rtcRoleTeam:
		if session.Side != "team_a" && session.Side != "team_b" {
			c.JSON(http.StatusForbidden, gin.H{"detail": "Hãy vào phòng trận của đội trước khi bật webcam."})
			return
		}
		info.Side = session.Side
	default:
		c.JSON(http.StatusForbidden, gin.H{"detail": "Vai trò này không được dùng webcam."})
		return
	}
	key := c.Param("id") + "/" + c.Param("matchId")
	room := h.room(key)

	room.mu.Lock()
	full := len(room.peers) >= rtcMaxPeers
	room.mu.Unlock()
	if full {
		h.release(key, room)
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Phòng webcam đã đầy."})
		return
	}

	upgrader := newUpgrader(allowedOrigins)
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.release(key, room)
		log.Println("[RTC] upgrade:", err)
		return
	}
	conn.SetReadLimit(rtcMaxMessage)
	_ = conn.SetReadDeadline(time.Now().Add(rtcPongWait))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(rtcPongWait)) })

	peer := &rtcPeer{rtcPeerInfo: info, conn: conn, send: make(chan []byte, rtcSendBuffer), room: room}

	room.mu.Lock()
	others := make([]rtcPeerInfo, 0, len(room.peers))
	for _, p := range room.peers {
		others = append(others, p.rtcPeerInfo)
	}
	room.peers[info.ID] = peer
	allow := room.allowOpponent
	room.mu.Unlock()

	go func() {
		ticker := time.NewTicker(rtcPingEvery)
		defer func() { ticker.Stop(); peer.close() }()
		for {
			select {
			case msg, ok := <-peer.send:
				_ = conn.SetWriteDeadline(time.Now().Add(rtcWriteWait))
				if !ok || conn.WriteMessage(websocket.TextMessage, msg) != nil {
					return
				}
			case <-ticker.C:
				if conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(rtcWriteWait)) != nil {
					return
				}
			}
		}
	}()

	peer.enqueue(gin.H{"type": rtcTypeWelcome, "self": info, "peers": others, "allow_opponent": allow})
	room.broadcast(info.ID, gin.H{"type": "peer-joined", "peer": info})

	defer func() {
		room.mu.Lock()
		delete(room.peers, info.ID)
		room.mu.Unlock()
		room.broadcast(info.ID, gin.H{"type": "peer-left", "id": info.ID})
		peer.close()
		h.release(key, room)
	}()

	window := time.Now()
	count := 0
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if time.Since(window) >= time.Second {
			window, count = time.Now(), 0
		}
		if count++; count > rtcRatePerSec {
			_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "quá nhiều thông điệp"), time.Now().Add(time.Second))
			return
		}
		var msg struct {
			Type  string          `json:"type"`
			To    string          `json:"to"`
			Role  string          `json:"role"`
			Data  json.RawMessage `json:"data"`
			Value bool            `json:"value"`
		}
		if json.Unmarshal(raw, &msg) != nil {
			continue
		}
		switch msg.Type {
		case "offer", "answer", "ice":
			room.mu.Lock()
			target := room.peers[msg.To]
			permitted := target != nil && canRelay(info, target.rtcPeerInfo, room.allowOpponent)
			room.mu.Unlock()
			if !permitted {
				peer.enqueue(gin.H{"type": "error", "detail": "Không được phép gửi tín hiệu tới thành viên này.", "to": msg.To})
				continue
			}
			target.enqueue(gin.H{"type": msg.Type, "from": info.ID, "role": msg.Role, "data": msg.Data})
		case rtcTypeAllow:
			if info.Role != rtcRoleAdmin {
				peer.enqueue(gin.H{"type": "error", "detail": "Chỉ ban tổ chức được bật quyền xem đối thủ."})
				continue
			}
			room.mu.Lock()
			room.allowOpponent = msg.Value
			room.mu.Unlock()
			room.broadcast("", gin.H{"type": rtcTypeAllow, "value": msg.Value})
		}
	}
}
