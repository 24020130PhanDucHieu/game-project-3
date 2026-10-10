# -*- coding: utf-8 -*-
"""
Router Quản lý Trận đấu, Bài nộp & Vận hành Sàn đấu (Match Operations API).
Xử lý đăng nhập phòng thi đấu, thẩm định bot trong Sandbox, khóa bài nộp,
khai hỏa round và chuyển round tự động.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, List

from app.database import db

router = APIRouter(prefix="/api/tournaments/{tournament_id}/matches", tags=["Matches & Submissions"])

class MatchLoginRequest(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    password: str = "admin123"
    student_id: Optional[str] = None

class MatchDraftCodeRequest(BaseModel):
    side: str = Field(default="team_a", description="Phe nộp nháp: team_a hoặc team_b")
    code_content: str
    language: str = "PYTHON"

class MatchAuthRequest(BaseModel):
    side: str = Field(default="team_a", description="Phe chọn: team_a hoặc team_b")
    student_id: str
    password: str = "12345"

class MatchCodeSubmitRequest(BaseModel):
    side: str = Field(default="team_a", description="Phe nộp: team_a hoặc team_b")
    code_content: str
    language: str = "PYTHON"

@router.post("/{match_id}/login")
def match_login_endpoint(tournament_id: str, match_id: str, req: MatchLoginRequest):
    try:
        user = req.username or req.role or req.student_id or ""
        res = db.authenticate_match_login(tournament_id, match_id, user, req.password, req.student_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{match_id}/auth")
def auth_match_team(tournament_id: str, match_id: str, req: MatchAuthRequest):
    try:
        res = db.authenticate_match_team(tournament_id, match_id, req.side, req.student_id, req.password)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{match_id}/draft-code")
def update_draft_code_endpoint(tournament_id: str, match_id: str, req: MatchDraftCodeRequest):
    try:
        res = db.update_match_draft_code(tournament_id, match_id, req.side, req.code_content, req.language)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{match_id}/code")
def update_code_for_round(tournament_id: str, match_id: str, req: MatchCodeSubmitRequest):
    try:
        res = db.update_match_code(tournament_id, match_id, req.side, req.code_content, req.language)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{match_id}/play-round")
def play_match_round_endpoint(tournament_id: str, match_id: str):
    try:
        res = db.play_match_round(tournament_id, match_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{match_id}/next-round")
def advance_to_next_round_endpoint(tournament_id: str, match_id: str):
    try:
        res = db.advance_to_next_round(tournament_id, match_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{match_id}/submissions")
def get_match_submissions_endpoint(tournament_id: str, match_id: str, role: str = "ADMIN", student_id: str = ""):
    try:
        res = db.get_match_submissions(tournament_id, match_id, role, student_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{match_id}/replay/{round_idx}")
def get_round_replay_endpoint(tournament_id: str, match_id: str, round_idx: int):
    try:
        res = db.get_round_replay(tournament_id, match_id, round_idx)
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{match_id}/demo-fill")
def quick_fill_demo_bots_endpoint(tournament_id: str, match_id: str):
    try:
        res = db.quick_fill_demo_bots(tournament_id, match_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{match_id}/reset")
def reset_match_endpoint(tournament_id: str, match_id: str):
    try:
        res = db.reset_match(tournament_id, match_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
