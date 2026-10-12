package websocket

import "testing"

func TestTournamentSubscriptionsDoNotMixRepeatedMatchIDs(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	first := &Client{TournamentID: "cup-a", Send: make(chan []byte, 4)}
	second := &Client{TournamentID: "cup-b", Send: make(chan []byte, 4)}
	hub.register <- first
	hub.register <- second
	hub.BroadcastTournamentJSON("cup-a", "m_lvl1_1", map[string]string{"action": "code"})
	hub.BroadcastTournamentJSON("cup-a", "m_lvl1_1", map[string]string{"action": "next-round"})
	<-first.Send
	<-first.Send
	select {
	case <-second.Send:
		t.Fatal("an event escaped its tournament subscription")
	default:
	}
	hub.unregister <- first
	hub.unregister <- second
}
