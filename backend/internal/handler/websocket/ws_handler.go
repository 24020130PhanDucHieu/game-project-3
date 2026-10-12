package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func newUpgrader(allowedOrigins string) websocket.Upgrader {
	return websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true
			}
			for _, allowed := range strings.Split(allowedOrigins, ",") {
				if candidate := strings.TrimSpace(allowed); candidate == "*" || candidate == origin {
					return true
				}
			}
			return false
		},
	}
}

type Client struct {
	Hub          *Hub
	Conn         *websocket.Conn
	Send         chan []byte
	MatchID      string
	TournamentID string
}

type Hub struct {
	clients        map[*Client]bool
	register       chan *Client
	unregister     chan *Client
	matchBroadcast chan matchMessage
}

type matchMessage struct {
	matchID      string
	tournamentID string
	data         []byte
}

func NewHub() *Hub {
	return &Hub{
		register:       make(chan *Client),
		unregister:     make(chan *Client),
		matchBroadcast: make(chan matchMessage, 256),
		clients:        make(map[*Client]bool),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
		case message := <-h.matchBroadcast:
			for client := range h.clients {
				if (client.TournamentID != "" && client.TournamentID != message.tournamentID) || (client.MatchID != "" && client.MatchID != message.matchID) {
					continue
				}
				select {
				case client.Send <- message.data:
				default:
					delete(h.clients, client)
					close(client.Send)
					_ = client.Conn.Close()
				}
			}
		}
	}
}

func (h *Hub) BroadcastTournamentJSON(tournamentID, matchID string, v interface{}) {
	if tournamentID == "" {
		return
	}
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("[WS] Could not encode match event: %v", err)
		return
	}
	select {
	case h.matchBroadcast <- matchMessage{tournamentID: tournamentID, matchID: matchID, data: data}:
	default:
		log.Printf("[WS] Dropped match event for %s because the queue is full", matchID)
	}
}

func ServeWS(hub *Hub, c *gin.Context, allowedOrigins string) {
	upgrader := newUpgrader(allowedOrigins)
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("[WS] Error upgrading connection:", err)
		return
	}

	tournamentID := c.Param("id")
	if tournamentID == "" {
		tournamentID = c.Query("tournament_id")
	}
	client := &Client{Hub: hub, Conn: conn, Send: make(chan []byte, 256), MatchID: c.Param("matchId"), TournamentID: tournamentID}
	conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(70 * time.Second)) })
	hub.register <- client

	go func() {
		defer func() {
			hub.unregister <- client
			client.Conn.Close()
		}()
		for {
			_, message, err := client.Conn.ReadMessage()
			if err != nil {
				break
			}
			// Echo or handle client message
			_ = message
		}
	}()

	go func() {
		defer client.Conn.Close()
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case message, ok := <-client.Send:
				if !ok {
					return
				}
				client.Conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
				if client.Conn.WriteMessage(websocket.TextMessage, message) != nil {
					return
				}
			case <-ticker.C:
				if client.Conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)) != nil {
					return
				}
			}
		}
	}()
}
