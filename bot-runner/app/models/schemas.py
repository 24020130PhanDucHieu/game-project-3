# -*- coding: utf-8 -*-
"""
Pydantic Schemas & Data Transfer Objects (DTO) cho Hệ thống Giải đấu OTTV2 ICPC.
Hỗ trợ quản lý Sinh viên, Bot đa phiên bản (v1, v2, v3), Lịch sử trận đấu và Bảng xếp hạng.
"""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
import uuid
import time

class MoveType:
    ROCK = "ROCK"
    PAPER = "PAPER"
    SCISSORS = "SCISSORS"
    JOKER = "JOKER"
    ALL = [ROCK, PAPER, SCISSORS, JOKER]

class TournamentStage:
    STAGE_1_STANDARD = "STAGE_1_STANDARD"       # 15 thẻ đều (5-5-5), 100 HP, sát thương 15
    STAGE_2_MUTATED = "STAGE_2_MUTATED"         # 7 Búa, 3 Bao, 5 Kéo; Hiệp chẵn x2 sát thương (30 HP)
    STAGE_3_REVERSE_FOG = "STAGE_3_REVERSE_FOG" # Hiệp lẻ đảo tương khắc; Sương mù ẩn bài đối thủ
    STAGE_4_FINALS = "STAGE_4_FINALS"           # Cấu hình luật động do Server truyền (Meta-Injection)
    STAGE_5_SPECIAL_TILES = "RULE_SPECIAL_TILES" # Ô Tiến hóa, Cổng dịch chuyển, Bẫy mìn, Joker

class BotLanguage:
    PYTHON = "PYTHON"
    CPP = "CPP"

# --- USER & BOT SCHEMAS ---
class UserRegisterRequest(BaseModel):
    student_id: str = Field(..., description="Mã số sinh viên (MSSV)")
    full_name: str = Field(..., description="Họ và tên thí sinh")
    class_name: str = Field(..., description="Lớp sinh hoạt K69")
    password: str = Field(..., description="Mật khẩu tài khoản")

class UserResponse(BaseModel):
    user_id: str
    student_id: str
    full_name: str
    class_name: str
    api_key: str

class BotSubmitRequest(BaseModel):
    student_id: str
    bot_name: str
    language: str = Field(default=BotLanguage.PYTHON, description="PYTHON hoặc CPP")
    version_tag: str = Field(default="v1.0", description="Ví dụ: v1.0, v2.0, v3.0")
    code_content: str = Field(..., description="Mã nguồn Bot (.py hoặc .cpp)")
    notes: Optional[str] = Field(default="", description="Ghi chú thuật toán")

class BotVersionInfo(BaseModel):
    version_id: str
    version_tag: str
    language: str
    code_content: str
    notes: str
    created_at: float
    is_active: bool = False

class BotProfileResponse(BaseModel):
    bot_id: str
    user_id: str
    bot_name: str
    language: str
    active_version: str
    elo_score: int = 1000
    matches_played: int = 0
    wins: int = 0
    win_rate: float = 0.0
    versions: List[BotVersionInfo] = []

# --- GAME RULES & STATE SCHEMAS ---
class GameRulesConfig(BaseModel):
    stage_name: str = TournamentStage.STAGE_1_STANDARD
    display_title: str = "Vòng 1: Luật Chuẩn Cổ Điển"
    description: str = "Kho 15 thẻ đều (5-5-5), 100 HP, tương khắc cổ điển Búa > Kéo > Bao > Búa."
    starting_hp: int = 100
    starting_deck: Dict[str, int] = Field(default_factory=lambda: {"ROCK": 5, "PAPER": 5, "SCISSORS": 5})
    base_damage: int = 15
    win_attack_bonus: int = 10
    even_turn_multiplier: float = 1.0
    reverse_odd_turns: bool = False
    fog_of_war: bool = False
    timeout_seconds: float = 1.0
    max_turns: int = 15
    counter_matrix: Dict[str, List[str]] = Field(
        default_factory=lambda: {
            "ROCK": ["SCISSORS"],
            "SCISSORS": ["PAPER"],
            "PAPER": ["ROCK"]
        }
    )

class PlayerTurnState(BaseModel):
    bot_id: str
    bot_name: str
    hp: int
    remaining_deck: Dict[str, int]
    chosen_move: Optional[str] = None
    damage_taken: int = 0
    attack_score_gained: int = 0
    is_knocked_out: bool = False
    warning: Optional[str] = None

class RoundResult(BaseModel):
    turn_number: int
    player_states: Dict[str, PlayerTurnState]
    combat_logs: List[str]
    is_even_turn: bool = False
    is_reverse_turn: bool = False

class MatchHistory(BaseModel):
    match_id: str
    match_type: str = "SOLO_1V1" # hoặc BATTLE_ROYALE_4P
    room_code: Optional[str] = None
    stage: str
    bot_ids: List[str]
    bot_names: Dict[str, str]
    winner_id: Optional[str] = None
    winner_name: Optional[str] = None
    total_turns: int = 0
    rounds: List[RoundResult] = []
    final_scores: Dict[str, int] = {}
    elo_changes: Dict[str, int] = {}
    created_at: float = Field(default_factory=time.time)

# --- SIMULATION & SOLO REQUESTS ---
class SelfPlayRequest(BaseModel):
    student_id: str
    version_a: str = Field(default="v2.0", description="Phiên bản thử nghiệm mới")
    version_b: str = Field(default="v1.0", description="Phiên bản cơ sở cũ")
    num_games: int = Field(default=10, ge=1, le=50)

class SelfPlayResponse(BaseModel):
    bot_name: str
    version_a: str
    version_b: str
    games_played: int
    wins_a: int
    wins_b: int
    draws: int
    win_rate_a: float
    recommendation: str

class SoloRoomCreateRequest(BaseModel):
    student_id: str
    bot_id: str

class SoloRoomJoinRequest(BaseModel):
    student_id: str
    room_code: str
    bot_id: str
