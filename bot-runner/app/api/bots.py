# -*- coding: utf-8 -*-
"""
Router Quản lý Bot Thí sinh, Đa phiên bản & Tự đấu Self-Play (Bot Management API).
"""

from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    BotSubmitRequest, BotProfileResponse, SelfPlayRequest, SelfPlayResponse
)
from app.database import db
from app.engine.rules import GameRulesEngine
from app.matchmaker.batch_runner import MatchCoordinator

router = APIRouter(tags=["Bots & Self-Play"])

@router.post("/api/bots/submit")
def submit_bot_code(req: BotSubmitRequest):
    bot = db.save_or_update_bot(
        student_id=req.student_id,
        bot_name=req.bot_name,
        language=req.language,
        version_tag=req.version_tag,
        code_content=req.code_content,
        notes=req.notes or ""
    )
    return {
        "status": "SUCCESS",
        "message": f"Nộp thành công Bot '{req.bot_name}' phiên bản {req.version_tag}!",
        "bot_id": bot["bot_id"],
        "active_version": bot["active_version"]
    }

@router.get("/api/bots/my-bot/{student_id}", response_model=BotProfileResponse)
def get_my_bot_profile(student_id: str):
    profile = db.get_bot_profile(student_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Chưa tìm thấy Bot của sinh viên này.")
    return profile

@router.post("/api/bots/rollback")
def rollback_bot(student_id: str, target_version: str):
    try:
        updated = db.rollback_bot_version(student_id, target_version)
        return {
            "status": "SUCCESS",
            "message": f"Đã khôi phục Bot về phiên bản {target_version}!",
            "active_version": updated["active_version"]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/simulate/self-play", response_model=SelfPlayResponse)
def simulate_self_play(req: SelfPlayRequest):
    bot_a = db.bots.get(req.bot_a_id)
    if not bot_a:
        raise HTTPException(status_code=404, detail="Không tìm thấy Bot A.")

    if req.bot_b_id.startswith("boss_"):
        bot_b = {"bot_id": req.bot_b_id, "bot_name": req.bot_b_id, "language": "PYTHON", "active_version": "v1.0"}
    else:
        bot_b = db.bots.get(req.bot_b_id)
        if not bot_b:
            raise HTTPException(status_code=404, detail="Không tìm thấy Bot B.")

    rules = GameRulesEngine.get_stage_rules(req.stage)
    coordinator = MatchCoordinator()
    match_result = coordinator.run_head_to_head_match(bot_a, bot_b, rules, req.num_matches)

    return SelfPlayResponse(
        match_id=match_result.match_id,
        bot_a_name=bot_a["bot_name"],
        bot_b_name=bot_b["bot_name"],
        num_matches=req.num_matches,
        stage=req.stage,
        winner_id=match_result.winner_id,
        scores=match_result.final_scores,
        rounds=match_result.rounds,
        total_time_ms=120.5
    )
