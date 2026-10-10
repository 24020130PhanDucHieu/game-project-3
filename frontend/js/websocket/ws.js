// =============================================================================
// WEBSOCKET MODULE - REAL-TIME MATCH BROADCAST LISTENER
// =============================================================================

let activeSocket = null;

export function connectMatchWebSocket(matchId, onEventCallback) {
  if (!matchId) return null;

  if (activeSocket) {
    try { activeSocket.close(); } catch(e) {}
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${protocol}//${window.location.host}/ws/matches/${matchId}`;

  try {
    activeSocket = new WebSocket(socketUrl);

    activeSocket.onopen = () => {
      console.log(`[WebSocket] Connected to match room ${matchId}`);
    };

    activeSocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (onEventCallback) onEventCallback(payload);
      } catch (err) {
        console.error('[WebSocket] Message decode error:', err);
      }
    };

    activeSocket.onclose = () => {
      console.log(`[WebSocket] Disconnected from match room ${matchId}`);
    };

    return activeSocket;
  } catch (err) {
    console.warn('[WebSocket] Init failed:', err);
    return null;
  }
}
