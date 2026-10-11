# -*- coding: utf-8 -*-
"""
Router Sàn đấu Realtime & Phòng riêng Solo 1v1 (Arena Stream & Solo Rooms API).
"""

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
import json
import asyncio
from typing import Dict, List

from app.database import db
from app.models.schemas import SoloRoomCreateRequest, SoloRoomJoinRequest

router = APIRouter(tags=["Arena & Solo Rooms"])

class PracticeMatchRequest(BaseModel):
    code_content: str
    language: str = "PYTHON"
    side: str = "team_a"
    boss: str = "RANDOM"

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)

    async def broadcast_to_room(self, room_id: str, message: dict):
        if room_id in self.active_connections:
            dead_sockets = []
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception:
                    dead_sockets.append(connection)
            for dead in dead_sockets:
                self.disconnect(room_id, dead)

ws_manager = ConnectionManager()

@router.post("/api/tournaments/{tournament_id}/practice-match")
def practice_match_endpoint(tournament_id: str, req: PracticeMatchRequest):
    try:
        res = db.run_practice_match(req.code_content, req.language, req.side, req.boss)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/rooms/create-solo")
def create_solo_room_endpoint(req: SoloRoomCreateRequest):
    room = db.create_solo_room(req.host_student_id, req.bot_name, req.language, req.code_content, req.stage)
    return {
        "status": "SUCCESS",
        "room_code": room["room_code"],
        "message": f"Tạo phòng {room['room_code']} thành công!"
    }

@router.post("/api/rooms/join-solo")
def join_solo_room_endpoint(req: SoloRoomJoinRequest):
    try:
        room = db.join_solo_room(req.room_code, req.guest_student_id, req.bot_name, req.language, req.code_content)
        return {"status": "SUCCESS", "room": room}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/rooms/solo/{room_code}")
def get_solo_room_endpoint(room_code: str):
    room = db.get_solo_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng.")
    return room

@router.post("/api/rooms/solo/{room_code}/play-turn")
def play_solo_turn_endpoint(room_code: str):
    room = db.get_solo_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng.")
    if room["status"] == "FINISHED":
        raise HTTPException(status_code=400, detail="Trận đấu đã kết thúc.")

    from app.engine.rules import GameRulesEngine
    from app.matchmaker.batch_runner import MatchCoordinator
    rules = GameRulesEngine.get_stage_rules(room["stage"])
    coordinator = MatchCoordinator()
    match = coordinator.run_head_to_head_match(
        room["host_player"],
        room["guest_player"],
        rules,
        num_matches=1
    )
    room["status"] = "FINISHED"
    return match

@router.websocket("/ws/arena/{match_id}")
async def websocket_arena_stream(websocket: WebSocket, match_id: str):
    await ws_manager.connect(match_id, websocket)
    try:
        match = db.matches.get(match_id)
        if match:
            await websocket.send_text(json.dumps({
                "type": "MATCH_INTRO",
                "match_id": match.match_id,
                "stage": match.stage,
                "bot_names": match.bot_names
            }))
            await asyncio.sleep(0.8)

            for r in match.rounds:
                await websocket.send_text(json.dumps({
                    "type": "ROUND_PLAY",
                    "round_data": r.dict()
                }))
                await asyncio.sleep(1.2)

            await websocket.send_text(json.dumps({
                "type": "MATCH_RESULT",
                "winner_id": match.winner_id,
                "winner_name": match.winner_name,
                "final_scores": match.final_scores,
                "elo_changes": match.elo_changes
            }))

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        ws_manager.disconnect(match_id, websocket)
    except Exception:
        ws_manager.disconnect(match_id, websocket)
