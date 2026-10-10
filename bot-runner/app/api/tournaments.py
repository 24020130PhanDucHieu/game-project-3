# -*- coding: utf-8 -*-
"""
Router Quản lý Giải đấu (Tournament Management API).
Tối ưu hóa phản hồi với In-Memory Cache, ETag và HTTP 304 Not Modified
cho phép hàng nghìn sinh viên polling đồng thời với độ trễ <1ms.
"""

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from typing import Optional, List
import json

from app.database import db

router = APIRouter(prefix="/api/tournaments", tags=["Tournaments"])

class CreateTournamentRequest(BaseModel):
    name: str = Field(default="Giải Đấu K69 Mới", description="Tên giải đấu")
    num_teams: int = Field(default=8, description="Số lượng đội (4, 8, 16, 32...)")

class AddTeamRequest(BaseModel):
    team_name: str
    student_id: str
    university: str = "Khối Kỹ Thuật"

@router.get("")
@router.get("/list")
def list_tournaments_fast(request: Request):
    raw_bytes, etag = db.get_all_tournaments_cached()
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag.strip('"'):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED)

    return Response(
        content=raw_bytes,
        media_type="application/json",
        headers={
            "ETag": f'"{etag}"',
            "Cache-Control": "public, max-age=1"
        }
    )

@router.get("/{tournament_id}")
def get_tournament_fast(tournament_id: str, request: Request):
    cached = db.get_tournament_cached(tournament_id)
    if not cached:
        raise HTTPException(status_code=404, detail="Không tìm thấy giải đấu.")

    raw_bytes, etag = cached
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag.strip('"'):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED)

    return Response(
        content=raw_bytes,
        media_type="application/json",
        headers={
            "ETag": f'"{etag}"',
            "Cache-Control": "public, max-age=1"
        }
    )

@router.post("/create")
def create_tournament_endpoint(req: CreateTournamentRequest):
    try:
        tourn = db.create_tournament(req.name, req.num_teams)
        return {
            "status": "SUCCESS",
            "message": f"Đã tạo giải đấu '{req.name}' với {req.num_teams} đội!",
            "tournament": tourn
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{tournament_id}/teams")
def add_team_endpoint(tournament_id: str, req: AddTeamRequest):
    try:
        res = db.add_team_to_tournament(tournament_id, req.team_name, req.student_id, req.university)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{tournament_id}/teams/{student_id}")
def remove_team_endpoint(tournament_id: str, student_id: str):
    try:
        res = db.remove_team_from_tournament(tournament_id, student_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{tournament_id}/teams/quick-fill")
def quick_fill_teams_endpoint(tournament_id: str):
    try:
        res = db.quick_fill_demo_teams(tournament_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{tournament_id}/auto-schedule")
def auto_schedule_endpoint(tournament_id: str):
    try:
        tourn = db.auto_schedule_tournament(tournament_id)
        return {
            "status": "SUCCESS",
            "message": "Đã tự động sắp xếp các đội vào lịch thi đấu!",
            "tournament": tourn
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{tournament_id}/teams")
def get_tournament_teams(tournament_id: str):
    return db.get_tournament_teams_overview(tournament_id)
