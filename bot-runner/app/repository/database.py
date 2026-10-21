# -*- coding: utf-8 -*-
"""
Tầng Lưu trữ Dữ liệu Hệ thống (Database Repository Layer).
Quản lý Tài khoản Thí sinh, Bot đa phiên bản (v1, v2, v3, rollback),
Cây Giải Đấu (Vòng Bảng -> Tứ Kết -> Bán Kết -> Chung Kết),
Lịch sử các ván đấu và Phòng riêng Solo 1v1 (#SOLO-XXXX).
"""

from typing import Dict, List, Optional, Tuple
import uuid
import time
import copy
import os
import json
import hashlib
import hmac
from app.models.schemas import (
    UserResponse, BotProfileResponse, BotVersionInfo, MatchHistory, TournamentStage, BotLanguage
)

class Database:
    def __init__(self):
        # Lưu trữ In-Memory hiệu năng cao, thread-safe
        self.users: Dict[str, dict] = {} # student_id -> user_dict
        self.bots: Dict[str, dict] = {}  # bot_id -> bot_dict
        self.bot_versions: Dict[str, List[dict]] = {} # bot_id -> list of version_dict
        self.matches: Dict[str, MatchHistory] = {} # match_id -> MatchHistory
        self.solo_rooms: Dict[str, dict] = {} # room_code -> room_dict
        
        # Mùa giải và giai đoạn hiện tại
        self.current_stage: str = TournamentStage.STAGE_1_STANDARD
        
        # Cấu trúc Cây Giải Đấu (Tournament Bracket) & 4 Bàn Đấu (OTTV2 4-Table Arena)
        self.bracket: dict = {}
        self.tables: Dict[int, dict] = {}
        self.tournaments: Dict[str, dict] = {}
        self.active_tournament_id: str = "tourn_k69_main"

        self.data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data")
        # Persistence belongs to the Go gateway. Importing the stateless
        # worker must not create directories on its read-only filesystem.
    def _get_serializable_data(self) -> dict:
        """Return serializable representation of tournament data."""
        return {"tournaments": self.tournaments, "active_tournament_id": self.active_tournament_id}

    def save_tournaments_to_file(self):
        pass

    def load_tournaments_from_file(self) -> bool:
        return False



    def _seed_default_data(self):
        """Khởi tạo tài khoản mẫu, Bot của BTC và các Bot tuyển thủ K69 mẫu"""
        # 1. 3 Boss AI của BTC
        boss_bots = [
            ("boss_random", "Boss_Random_AI", "BTC_ADMIN", "Bot Nhập môn (Ra bài ngẫu nhiên)", 1000),
            ("boss_counter", "Boss_Counter_AI", "BTC_ADMIN", "Bot Thống kê (Đếm tần suất & Khắc chế)", 1150),
            ("boss_nash", "Boss_Nash_AI", "BTC_ADMIN", "Bot Bậc thầy (Chuỗi Markov & Cân bằng Nash)", 1300)
        ]
        for bid, bname, sid, desc, elo in boss_bots:
            self.bots[bid] = {
                "bot_id": bid,
                "user_id": "btc_admin",
                "student_id": sid,
                "bot_name": bname,
                "language": BotLanguage.PYTHON,
                "active_version": "v1.0",
                "elo_score": elo,
                "matches_played": 12,
                "wins": 6,
                "is_boss": True
            }

        # 2. 8 Bot Thí sinh Tân Sinh viên K69 có sẵn mã nguồn thực tế để thi đấu ngay
        competitor_bots = [
            ("bot_k69_alpha", "K69_AlphaBot", "24020001", "Trần Minh Anh", "K69-CACLC", 1240, 
             "def decide_move(game_state):\n    cards = game_state.get('remaining_cards', {})\n    avail = [c for c, n in cards.items() if n > 0]\n    if 'ROCK' in avail: return 'ROCK'\n    return avail[0] if avail else 'ROCK'"),
            
            ("bot_uet_phoenix", "UET_Phoenix", "24020015", "Lê Bảo Nam", "K69-CNTT", 1280,
             "def decide_move(game_state):\n    cards = game_state.get('remaining_cards', {})\n    avail = [c for c, n in cards.items() if n > 0]\n    turn = game_state.get('turn_number', 1)\n    if turn % 2 == 0 and 'PAPER' in avail: return 'PAPER'\n    return avail[0] if avail else 'ROCK'"),
            
            ("bot_hust_dragon", "HUST_Dragon", "24020042", "Hoàng Quốc Đạt", "K69-KTPM", 1210,
             "def decide_move(game_state):\n    cards = game_state.get('remaining_cards', {})\n    avail = [c for c, n in cards.items() if n > 0]\n    if 'SCISSORS' in avail: return 'SCISSORS'\n    return avail[0] if avail else 'PAPER'"),
            
            ("bot_ptit_ninja", "PTIT_Ninja", "24020068", "Nguyễn Thu Hà", "K69-KHMT", 1190,
             "def decide_move(game_state):\n    import random\n    cards = game_state.get('remaining_cards', {})\n    avail = [c for c, n in cards.items() if n > 0]\n    return random.choice(avail) if avail else 'ROCK'"),
            
            ("bot_dut_striker", "DUT_Striker", "24020088", "Phạm Hải Đăng", "K69-ATTT", 1160,
             "def decide_move(game_state):\n    cards = game_state.get('remaining_cards', {})\n    avail = [c for c, n in cards.items() if n > 0]\n    hist = game_state.get('history', [])\n    if hist and 'ROCK' in str(hist[-1]) and 'PAPER' in avail: return 'PAPER'\n    return avail[0] if avail else 'ROCK'"),
            
            ("bot_kma_cyber", "KMA_CyberBot", "24020102", "Đỗ Văn Kiên", "K69-KTTT", 1175,
             "def decide_move(game_state):\n    cards = game_state.get('remaining_cards', {})\n    avail = [c for c, n in cards.items() if n > 0]\n    if 'PAPER' in avail: return 'PAPER'\n    return avail[0] if avail else 'ROCK'"),
            
            ("bot_vnu_master", "VNU_MasterAI", "24020130", "Nguyễn Tuấn Dũng", "K69-CACLC", 1310,
             "def decide_move(game_state):\n    cards = game_state.get('remaining_cards', {})\n    avail = [c for c, n in cards.items() if n > 0]\n    turn = game_state.get('turn_number', 1)\n    if turn % 2 == 0 and 'ROCK' in avail: return 'ROCK'\n    if 'SCISSORS' in avail: return 'SCISSORS'\n    return avail[0] if avail else 'ROCK'"),
            
            ("bot_bk_gladiator", "BK_Gladiator", "24020155", "Vũ Hoàng Sơn", "K69-CNTT", 1225,
             "def decide_move(game_state):\n    cards = game_state.get('remaining_cards', {})\n    avail = [c for c, n in cards.items() if n > 0]\n    return avail[-1] if avail else 'ROCK'")
        ]

        for bid, bname, sid, sname, cname, elo, code in competitor_bots:
            self.users[sid] = {
                "user_id": f"usr_{bid}",
                "student_id": sid,
                "full_name": sname,
                "class_name": cname,
                "password": "123",
                "api_key": f"key_{sid}",
                "created_at": time.time()
            }
            self.bots[bid] = {
                "bot_id": bid,
                "user_id": f"usr_{bid}",
                "student_id": sid,
                "bot_name": bname,
                "language": BotLanguage.PYTHON,
                "active_version": "v1.0",
                "elo_score": elo,
                "matches_played": 8,
                "wins": 5,
                "is_boss": False
            }
            self.bot_versions[bid] = [{
                "version_id": f"v_{bid}_1",
                "version_tag": "v1.0",
                "language": BotLanguage.PYTHON,
                "code_content": code,
                "notes": "Bản thi đấu chính thức",
                "created_at": time.time(),
                "is_active": True
            }]

    def init_tournament_bracket(self):
        """Khởi tạo cây giải đấu chuẩn: Vòng Bảng -> Tứ Kết -> Bán Kết -> Chung Kết"""
        self.bracket = {
            "current_round": "GROUP_STAGE", # GROUP_STAGE -> QUARTER_FINALS -> SEMI_FINALS -> GRAND_FINALS -> FINISHED
            "round_title": "Vòng Bảng: Phân Nhánh Bảng A & B",
            "groups": {
                "GROUP_A": {
                    "name": "Bảng A (Bảng Đấu Trực Tiếp)",
                    "bots": [
                        {"bot_id": "bot_vnu_master", "bot_name": "VNU_MasterAI", "points": 6, "diff": "+45 HP"},
                        {"bot_id": "bot_uet_phoenix", "bot_name": "UET_Phoenix", "points": 4, "diff": "+20 HP"},
                        {"bot_id": "bot_k69_alpha", "bot_name": "K69_AlphaBot", "points": 2, "diff": "-15 HP"},
                        {"bot_id": "bot_ptit_ninja", "bot_name": "PTIT_Ninja", "points": 0, "diff": "-50 HP"}
                    ]
                },
                "GROUP_B": {
                    "name": "Bảng B (Bảng Đấu Trực Tiếp)",
                    "bots": [
                        {"bot_id": "bot_bk_gladiator", "bot_name": "BK_Gladiator", "points": 6, "diff": "+40 HP"},
                        {"bot_id": "bot_hust_dragon", "bot_name": "HUST_Dragon", "points": 4, "diff": "+15 HP"},
                        {"bot_id": "bot_kma_cyber", "bot_name": "KMA_CyberBot", "points": 2, "diff": "-10 HP"},
                        {"bot_id": "bot_dut_striker", "bot_name": "DUT_Striker", "points": 0, "diff": "-45 HP"}
                    ]
                }
            },
            "quarter_finals": [
                {
                    "match_idx": 1,
                    "title": "Tứ Kết 1",
                    "bot_1": {"bot_id": "bot_vnu_master", "bot_name": "VNU_MasterAI", "hp": 100},
                    "bot_2": {"bot_id": "bot_dut_striker", "bot_name": "DUT_Striker", "hp": 100},
                    "winner_id": "bot_vnu_master",
                    "winner_name": "VNU_MasterAI",
                    "match_id": None,
                    "status": "COMPLETED"
                },
                {
                    "match_idx": 2,
                    "title": "Tứ Kết 2",
                    "bot_1": {"bot_id": "bot_uet_phoenix", "bot_name": "UET_Phoenix", "hp": 100},
                    "bot_2": {"bot_id": "bot_kma_cyber", "bot_name": "KMA_CyberBot", "hp": 100},
                    "winner_id": "bot_uet_phoenix",
                    "winner_name": "UET_Phoenix",
                    "match_id": None,
                    "status": "COMPLETED"
                },
                {
                    "match_idx": 3,
                    "title": "Tứ Kết 3",
                    "bot_1": {"bot_id": "bot_bk_gladiator", "bot_name": "BK_Gladiator", "hp": 100},
                    "bot_2": {"bot_id": "bot_ptit_ninja", "bot_name": "PTIT_Ninja", "hp": 100},
                    "winner_id": "bot_bk_gladiator",
                    "winner_name": "BK_Gladiator",
                    "match_id": None,
                    "status": "COMPLETED"
                },
                {
                    "match_idx": 4,
                    "title": "Tứ Kết 4",
                    "bot_1": {"bot_id": "bot_hust_dragon", "bot_name": "HUST_Dragon", "hp": 100},
                    "bot_2": {"bot_id": "bot_k69_alpha", "bot_name": "K69_AlphaBot", "hp": 100},
                    "winner_id": "bot_hust_dragon",
                    "winner_name": "HUST_Dragon",
                    "match_id": None,
                    "status": "COMPLETED"
                }
            ],
            "semi_finals": [
                {
                    "match_idx": 1,
                    "title": "Bán Kết 1 (Top 4)",
                    "bot_1": {"bot_id": "bot_vnu_master", "bot_name": "VNU_MasterAI", "hp": 100},
                    "bot_2": {"bot_id": "bot_uet_phoenix", "bot_name": "UET_Phoenix", "hp": 100},
                    "winner_id": None,
                    "winner_name": None,
                    "match_id": None,
                    "status": "READY"
                },
                {
                    "match_idx": 2,
                    "title": "Bán Kết 2 (Top 4)",
                    "bot_1": {"bot_id": "bot_bk_gladiator", "bot_name": "BK_Gladiator", "hp": 100},
                    "bot_2": {"bot_id": "bot_hust_dragon", "bot_name": "HUST_Dragon", "hp": 100},
                    "winner_id": None,
                    "winner_name": None,
                    "match_id": None,
                    "status": "READY"
                }
            ],
            "grand_final": {
                "title": "Trận Chung Kết Tổng (Grand Finals K69)",
                "bot_1": {"bot_id": None, "bot_name": "Thắng Bán Kết 1", "hp": 100},
                "bot_2": {"bot_id": None, "bot_name": "Thắng Bán Kết 2", "hp": 100},
                "winner_id": None,
                "winner_name": None,
                "match_id": None,
                "status": "WAITING"
            },
            "champion": None
        }

    def init_tournament_tables(self):
        """Khởi tạo 4 bàn thi đấu chuẩn theo layout giải đấu 4 Bàn (BÀN 1 -> BÀN 4)"""
        table_configs = [
            {"id": 1, "name": "BÀN 1", "red": "bot_vnu_master", "blue": "bot_dut_striker"},
            {"id": 2, "name": "BÀN 2", "red": "bot_uet_phoenix", "blue": "bot_kma_cyber"},
            {"id": 3, "name": "BÀN 3", "red": "bot_bk_gladiator", "blue": "bot_ptit_ninja"},
            {"id": 4, "name": "BÀN 4", "red": "bot_hust_dragon", "blue": "bot_k69_alpha"},
        ]
        self.tables = {}
        
        # Mẫu bố trí 9 quân ban đầu trên lưới 9x9
        # Red ở hàng 7 (cols 0..8), Blue ở hàng 1 (cols 0..8)
        default_red_pieces = [
            {"id": f"r_{i}", "col": i, "row": 7, "type": t, "alive": True}
            for i, t in enumerate(["ROCK", "PAPER", "SCISSORS", "ROCK", "PAPER", "SCISSORS", "ROCK", "PAPER", "SCISSORS"])
        ]
        default_blue_pieces = [
            {"id": f"b_{i}", "col": i, "row": 1, "type": t, "alive": True}
            for i, t in enumerate(["PAPER", "ROCK", "SCISSORS", "ROCK", "PAPER", "SCISSORS", "ROCK", "PAPER", "SCISSORS"])
        ]
        
        for cfg in table_configs:
            rb = self.bots.get(cfg["red"], {})
            bb = self.bots.get(cfg["blue"], {})
            self.tables[cfg["id"]] = {
                "table_id": cfg["id"],
                "name": cfg["name"],
                "status": "READY", # READY, PLAYING, FINISHED
                "status_text": "Sẵn sàng",
                "red_bot": {
                    "bot_id": cfg["red"],
                    "bot_name": rb.get("bot_name", "Bot Đỏ"),
                    "student_id": rb.get("student_id", ""),
                    "hp": 100,
                    "max_hp": 100,
                    "pieces_left": 9,
                    "pieces_total": 9,
                    "deck": {"ROCK": 3, "PAPER": 3, "SCISSORS": 3}
                },
                "blue_bot": {
                    "bot_id": cfg["blue"],
                    "bot_name": bb.get("bot_name", "Bot Xanh"),
                    "student_id": bb.get("student_id", ""),
                    "hp": 100,
                    "max_hp": 100,
                    "pieces_left": 9,
                    "pieces_total": 9,
                    "deck": {"ROCK": 3, "PAPER": 3, "SCISSORS": 3}
                },
                "board": {
                    "size": 9,
                    "red_base": [0, 8],
                    "blue_base": [8, 0],
                    "red_pieces": copy.deepcopy(default_red_pieces),
                    "blue_pieces": copy.deepcopy(default_blue_pieces)
                },
                "current_round": 0,
                "max_rounds": 9,
                "winner_id": None,
                "winner_name": None,
                "last_match_id": None,
                "logs": [f"Bàn đấu {cfg['name']} sẵn sàng. Đang chờ hiệu lệnh khai hỏa."]
            }

    def get_tables(self) -> List[dict]:
        """Lấy danh sách 4 bàn thi đấu"""
        return list(self.tables.values())

    def get_table(self, table_id: int) -> Optional[dict]:
        return self.tables.get(table_id)

    def seat_table(self, table_id: int, bot_id: str, side: str = "red") -> dict:
        """Gán một bot vào một bàn đấu cụ thể"""
        table = self.tables.get(table_id)
        if not table:
            raise ValueError(f"Bàn đấu {table_id} không tồn tại.")
        bot = self.bots.get(bot_id)
        if not bot:
            raise ValueError(f"Bot {bot_id} không tồn tại.")
            
        bot_info = {
            "bot_id": bot_id,
            "bot_name": bot.get("bot_name", "Bot"),
            "student_id": bot.get("student_id", ""),
            "hp": 100,
            "max_hp": 100,
            "pieces_left": 9,
            "pieces_total": 9,
            "deck": {"ROCK": 3, "PAPER": 3, "SCISSORS": 3}
        }
        if side.lower() == "red":
            table["red_bot"] = bot_info
        else:
            table["blue_bot"] = bot_info
        table["status"] = "READY"
        table["status_text"] = "Sẵn sàng"
        table["logs"].append(f"Đã xếp {bot.get('bot_name')} vào phe {'Đỏ' if side.lower() == 'red' else 'Xanh'}.")
        return table

    def reset_tables(self):
        """Khôi phục lại 4 bàn thi đấu ban đầu"""
        self.init_tournament_tables()
        return list(self.tables.values())

    # --- GETTERS ---
    def get_all_bots(self) -> List[dict]:
        """Lấy danh sách tất cả Bot để đổ vào Dropdown chọn trận đấu"""
        res = []
        for b in self.bots.values():
            res.append({
                "bot_id": b["bot_id"],
                "bot_name": b["bot_name"],
                "student_id": b.get("student_id", ""),
                "language": b.get("language", "PYTHON"),
                "elo_score": b.get("elo_score", 1000),
                "is_boss": b.get("is_boss", False)
            })
        # Ưu tiên xếp Bot của sinh viên lên trước, Boss xuống sau
        res.sort(key=lambda x: (not x["is_boss"], x["elo_score"]), reverse=True)
        return res

    def get_bracket(self) -> dict:
        return self.bracket

    # --- USER METHODS ---
    def register_user(self, student_id: str, full_name: str, class_name: str, password: str) -> UserResponse:
        student_id = student_id.strip().upper()
        if student_id in self.users:
            raise ValueError(f"Mã số sinh viên {student_id} đã được đăng ký.")

        user_id = str(uuid.uuid4())
        api_key = f"k69_{uuid.uuid4().hex[:12]}"
        user_data = {
            "user_id": user_id,
            "student_id": student_id,
            "full_name": full_name,
            "class_name": class_name,
            "password": password,
            "api_key": api_key,
            "created_at": time.time()
        }
        self.users[student_id] = user_data
        return UserResponse(**user_data)

    def get_user(self, student_id: str) -> Optional[dict]:
        return self.users.get(student_id.strip().upper())

    # --- BOT & VERSIONING METHODS ---
    def save_or_update_bot(
        self,
        student_id: str,
        bot_name: str,
        language: str,
        version_tag: str,
        code_content: str,
        notes: str = ""
    ) -> dict:
        student_id = student_id.strip().upper()
        existing_bot = None
        for b in self.bots.values():
            if b.get("student_id") == student_id:
                existing_bot = b
                break

        if not existing_bot:
            bot_id = str(uuid.uuid4())
            existing_bot = {
                "bot_id": bot_id,
                "user_id": self.users.get(student_id, {}).get("user_id", "guest"),
                "student_id": student_id,
                "bot_name": bot_name,
                "language": language,
                "active_version": version_tag,
                "elo_score": 1000,
                "matches_played": 0,
                "wins": 0,
                "is_boss": False
            }
            self.bots[bot_id] = existing_bot
            self.bot_versions[bot_id] = []
        else:
            bot_id = existing_bot["bot_id"]
            existing_bot["bot_name"] = bot_name
            existing_bot["language"] = language
            existing_bot["active_version"] = version_tag

        version_id = str(uuid.uuid4())
        version_entry = {
            "version_id": version_id,
            "version_tag": version_tag,
            "language": language,
            "code_content": code_content,
            "notes": notes,
            "created_at": time.time(),
            "is_active": True
        }
        for v in self.bot_versions[bot_id]:
            v["is_active"] = False
        self.bot_versions[bot_id].append(version_entry)

        return existing_bot

    def rollback_bot_version(self, student_id: str, target_version_tag: str) -> dict:
        student_id = student_id.strip().upper()
        for bot_id, bot in self.bots.items():
            if bot.get("student_id") == student_id:
                versions = self.bot_versions.get(bot_id, [])
                found = False
                for v in versions:
                    if v["version_tag"] == target_version_tag:
                        v["is_active"] = True
                        found = True
                    else:
                        v["is_active"] = False
                if found:
                    bot["active_version"] = target_version_tag
                    return bot
                raise ValueError(f"Không tìm thấy phiên bản {target_version_tag} để rollback.")
        raise ValueError("Sinh viên chưa có Bot nào trên hệ thống.")

    def get_bot_profile(self, student_id: str) -> Optional[BotProfileResponse]:
        student_id = student_id.strip().upper()
        for bot_id, bot in self.bots.items():
            if bot.get("student_id") == student_id:
                versions = [
                    BotVersionInfo(**v) for v in self.bot_versions.get(bot_id, [])
                ]
                matches = bot["matches_played"]
                wins = bot["wins"]
                win_rate = round((wins / matches * 100), 1) if matches > 0 else 0.0
                return BotProfileResponse(
                    bot_id=bot["bot_id"],
                    user_id=bot["user_id"],
                    bot_name=bot["bot_name"],
                    language=bot["language"],
                    active_version=bot["active_version"],
                    elo_score=bot["elo_score"],
                    matches_played=matches,
                    wins=wins,
                    win_rate=win_rate,
                    versions=versions
                )
        return None

    def get_active_code(self, bot_id: str) -> Optional[dict]:
        bot = self.bots.get(bot_id)
        if not bot:
            return None
        active_tag = bot["active_version"]
        versions = self.bot_versions.get(bot_id, [])
        for v in versions:
            if v["version_tag"] == active_tag:
                return v
        if versions:
            return versions[-1]
        return None

    # --- MATCHES & LEADERBOARD ---
    def save_match(self, match: MatchHistory):
        self.matches[match.match_id] = match
        if match.winner_id and match.winner_id in self.bots:
            self.bots[match.winner_id]["wins"] += 1
        for bid in match.bot_ids:
            if bid in self.bots:
                self.bots[bid]["matches_played"] += 1

    def get_leaderboard(self) -> List[dict]:
        ranked = []
        for b in self.bots.values():
            if b.get("is_boss", False):
                continue
            matches = b["matches_played"]
            wins = b["wins"]
            wr = round((wins / matches * 100), 1) if matches > 0 else 0.0
            ranked.append({
                "bot_id": b["bot_id"],
                "bot_name": b["bot_name"],
                "student_id": b["student_id"],
                "language": b["language"],
                "active_version": b["active_version"],
                "elo_score": b["elo_score"],
                "matches_played": matches,
                "wins": wins,
                "win_rate": wr
            })
        ranked.sort(key=lambda x: (x["elo_score"], x["win_rate"], x["wins"]), reverse=True)
        for i, item in enumerate(ranked):
            item["rank"] = i + 1
        return ranked

    # --- SOLO ROOM MANAGEMENT ---
    def create_solo_room(self, host_student_id: str, host_bot_id: str) -> str:
        code = f"#SOLO-{uuid.uuid4().hex[:4].upper()}"
        self.solo_rooms[code] = {
            "room_code": code,
            "host_student_id": host_student_id,
            "host_bot_id": host_bot_id,
            "guest_student_id": None,
            "guest_bot_id": None,
            "status": "WAITING",
            "created_at": time.time()
        }
        return code

    def join_solo_room(self, guest_student_id: str, guest_bot_id: str, room_code: str) -> dict:
        room_code = room_code.strip().upper()
        if not room_code.startswith("#SOLO-"):
            room_code = f"#SOLO-{room_code}"
        room = self.solo_rooms.get(room_code)
        if not room:
            raise ValueError(f"Phòng đấu {room_code} không tồn tại.")
        if room["status"] != "WAITING":
            raise ValueError(f"Phòng {room_code} đã đủ người hoặc đang thi đấu.")
        room["guest_student_id"] = guest_student_id
        room["guest_bot_id"] = guest_bot_id
        room["status"] = "READY"
        return room

    # =========================================================================
    # MULTI-TOURNAMENT ENGINE & 5-ROUND MATCH RUNNER
    # =========================================================================

    @staticmethod
    def make_team_slot(t_data):
        if not t_data:
            return None
        return {
            "bot_id": t_data.get("bot_id", f"bot_{t_data['student_id']}"),
            "student_id": t_data["student_id"],
            "credential_hash": t_data.get("credential_hash", ""),
            "team_name": t_data["team_name"],
            "university": t_data.get("university", "Khối Kỹ Thuật"),
            "authenticated": False,
            "code_submitted": False,
            "code_valid": False,
            "validation_error": None,
            "active_submission_id": None,
            "current_code": t_data.get("code_content", ""),
            "current_lang": t_data.get("language", BotLanguage.PYTHON),
            "draft_code": t_data.get("code_content", ""),
            "draft_lang": t_data.get("language", BotLanguage.PYTHON),
            "rounds_won": 0,
            "hp": 100
        }

    @staticmethod
    def build_bracket_matches(num_teams: int) -> dict:
        import math
        if num_teams < 4 or (num_teams & (num_teams - 1)) != 0:
            raise ValueError("Số lượng đội phải là lũy thừa của 2 (ví dụ: 4, 8, 16, 32...)!")
        
        k = int(math.log2(num_teams))
        matches = {}
        
        # Tạo các tầng từ 1 đến k (k là chung kết)
        for lvl in range(1, k + 1):
            num_matches = 2 ** (k - lvl)
            d = k - lvl
            if d == 0:
                round_name = "Chung Kết"
            elif d == 1:
                round_name = "Bán Kết"
            elif d == 2:
                round_name = "Tứ Kết"
            elif d == 3:
                round_name = "Vòng 1/8"
            elif d == 4:
                round_name = "Vòng 1/16"
            else:
                round_name = f"Vòng 1/{2**d}"

            for i in range(num_matches):
                if lvl == k:
                    m_id = "m_gf"
                    m_title = "Chung Kết Tổng"
                    next_m = None
                    next_slot = None
                else:
                    m_id = f"m_lvl{lvl}_{i+1}"
                    m_title = f"{round_name} {i+1}"
                    next_m = "m_gf" if lvl + 1 == k else f"m_lvl{lvl+1}_{i//2 + 1}"
                    next_slot = "team_a" if i % 2 == 0 else "team_b"

                matches[m_id] = {
                    "match_id": m_id,
                    "title": m_title,
                    "round_level": lvl,
                    "round_name": round_name,
                    "next_match_id": next_m,
                    "next_slot": next_slot,
                    "team_a": None,
                    "team_b": None,
                    "status": "WAITING",
                    "round_status": "AWAITING_SUBMISSIONS",
                    "all_teams_ready": False,
                    "battle_running": False,
                    "intermission_ends_at": None,
                    "current_round_idx": 1,
                    "max_rounds": 5,
                    "tie_break_seed": uuid.uuid4().hex,
                    "rounds_history": [],
                    "submissions_history": [],
                    "winner": None,
                    "winner_name": None
                }
                
        return matches

    def init_default_tournament(self):
        """Khởi tạo giải đấu mẫu ban đầu cho tân sinh viên K69"""
        self.create_tournament(
            name="Giải Đấu Tân Sinh Viên ICPC K69 - Vô Địch OTTV2",
            num_teams=8,
            tournament_id="tourn_k69_main"
        )
        self.quick_fill_demo_teams("tourn_k69_main")

    def create_tournament(self, name: str, num_teams: int = 8, tournament_id: Optional[str] = None) -> dict:
        """
        Khởi tạo giải đấu mới với số đội là lũy thừa của 2 (4, 8, 16, 32...).
        Ban đầu các trận trong sơ đồ chưa có đội nào cho đến khi bấm 'Tự Sắp Xếp Lịch Đấu'.
        """
        if not name or not name.strip():
            raise ValueError("Tên giải đấu không được để trống!")
        if num_teams < 4 or (num_teams & (num_teams - 1)) != 0:
            raise ValueError(f"Số lượng đội ({num_teams}) không hợp lệ! Bắt buộc phải là lũy thừa của 2 (4, 8, 16, 32...) và tối thiểu 4 đội.")
            
        t_id = tournament_id or f"tourn_{uuid.uuid4().hex[:6]}"
        matches = Database.build_bracket_matches(num_teams)

        tourn_obj = {
            "tournament_id": t_id,
            "name": name.strip(),
            "num_teams": num_teams,
            "teams": [],
            "matches": matches,
            "champion": None,
            "status": "CONFIGURING",
            "stage_rule": "STAGE_1_STANDARD",
            "created_at": time.time()
        }
        self.tournaments[t_id] = tourn_obj
        self.active_tournament_id = t_id
        self.save_tournaments_to_file()
        return tourn_obj

    def add_team_to_tournament(self, tournament_id: str, team_name: str, student_id: str, university: str = "Khối Kỹ Thuật") -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        self.ensure_tournament_editable(tourn)
        if not team_name or not team_name.strip():
            raise ValueError("Tên đội không được để trống!")
        if not student_id or not student_id.strip():
            raise ValueError("MSSV đại diện không được để trống!")

        num_teams = tourn["num_teams"]
        teams = tourn.get("teams", [])
        if len(teams) >= num_teams:
            raise ValueError(f"Giải đấu đã đủ {num_teams}/{num_teams} đội theo cấu hình quy định! Không thể thêm thêm.")
        if any(t["student_id"].strip().upper() == student_id.strip().upper() for t in teams):
            raise ValueError(f"Mã sinh viên '{student_id.strip()}' đã được ghi danh cho một đội trong giải này!")
        if any(t["team_name"].strip().lower() == team_name.strip().lower() for t in teams):
            raise ValueError(f"Tên đội '{team_name.strip()}' đã tồn tại trong giải đấu này!")
            
        access_code = self.default_team_access_code(student_id.strip())
        new_team = {
            "seed": len(teams) + 1,
            "bot_id": f"bot_{student_id.strip()}",
            "student_id": student_id.strip(),
            "credential_hash": hashlib.sha256(access_code.encode()).hexdigest(),
            "team_name": team_name.strip(),
            "university": university.strip() or "Khối Kỹ Thuật",
            "code_content": "def decide_move(game_state):\n    return 'ROCK'",
            "language": BotLanguage.PYTHON,
            "elo": 1200
        }
        teams.append(new_team)
        self.save_tournaments_to_file()
        return {
            "status": "SUCCESS",
            "message": f"Đã thêm đội '{team_name.strip()}' (MSSV: {student_id.strip()}) thành công!",
            "team_access_code": access_code,
            "teams": teams,
            "total": len(teams),
            "capacity": num_teams
        }

    @staticmethod
    def default_team_access_code(student_id: str) -> str:
        return f"k69{str(student_id or '').strip()}"

    @staticmethod
    def ensure_tournament_editable(tournament: dict):
        if any(match.get("rounds_history") or match.get("battle_running")
               for match in tournament.get("matches", {}).values()):
            raise ValueError("Giải đã bắt đầu thi đấu. Không thể thay đổi đội hoặc xếp lại nhánh đấu vì sẽ làm mất kết quả.")

    def remove_team_from_tournament(self, tournament_id: str, student_id: str) -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        self.ensure_tournament_editable(tourn)
        teams = tourn.get("teams", [])
        init_len = len(teams)
        tourn["teams"] = [t for t in teams if t["student_id"].strip().upper() != student_id.strip().upper()]
        if len(tourn["teams"]) == init_len:
            raise ValueError(f"Không tìm thấy đội có MSSV '{student_id}'.")
        for idx, t in enumerate(tourn["teams"]):
            t["seed"] = idx + 1
        # Xóa đội thì reset lại lịch đấu trên sơ đồ
        tourn["matches"] = Database.build_bracket_matches(tourn["num_teams"])
        tourn["status"] = "CONFIGURING"
        self.save_tournaments_to_file()
        return {
            "status": "SUCCESS",
            "message": "Đã xóa đội khỏi danh sách giải đấu!",
            "teams": tourn["teams"],
            "total": len(tourn["teams"]),
            "capacity": tourn["num_teams"]
        }

    def quick_fill_demo_teams(self, tournament_id: str) -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        self.ensure_tournament_editable(tourn)
        num_teams = tourn["num_teams"]
        demo_pool = [
            ("K69_AlphaBot", "24020001", "ĐHQG Hà Nội"),
            ("BK_Gladiator", "24020160", "ĐHBK Hà Nội"),
            ("PTIT_Ninja", "24020300", "Học Viện PTIT"),
            ("DUT_Striker", "24020450", "ĐH Bách Khoa ĐN"),
            ("UET_Phoenix", "24020520", "ĐH Công Nghệ ĐHQG"),
            ("HCMUS_Titans", "24020610", "ĐH KHTN ĐHQG-HCM"),
            ("HUST_Cyborg", "24020740", "Viện CNTT HUST"),
            ("FPT_Warriors", "24020880", "Đại Học FPT"),
            ("VKU_Dragon", "24020910", "ĐH CNTT & TT Việt Hàn"),
            ("UIT_Cyber", "24021020", "ĐH CNTT ĐHQG-HCM"),
            ("HAU_Spartan", "24021130", "ĐH Kiến Trúc HN"),
            ("VNU_Gryphon", "24021240", "Khối Chuyên Toán Tin"),
            ("TLU_Hydra", "24021350", "ĐH Thăng Long"),
            ("UTC_Vanguard", "24021460", "ĐH Giao Thông Vận Tải"),
            ("TDTU_Ronin", "24021570", "ĐH Tôn Đức Thắng"),
            ("CTU_Lotus", "24021680", "ĐH Cần Thơ"),
            ("NEU_Alpha", "24021790", "ĐH Kinh Tế Quốc Dân"),
            ("FTU_Pegasus", "24021810", "ĐH Ngoại Thương"),
            ("HU_Falcon", "24021920", "ĐH Huế"),
            ("QNU_Wave", "24022030", "ĐH Quy Nhơn"),
            ("DLU_Pine", "24022140", "ĐH Đà Lạt"),
            ("TNUS_Star", "24022250", "ĐH Thái Nguyên"),
            ("VGU_Eagle", "24022360", "ĐH Việt Đức"),
            ("BUV_Lion", "24022470", "British University VN"),
            ("RMIT_Apex", "24022580", "RMIT University"),
            ("VinUni_Apex", "24022690", "VinUniversity"),
            ("Phenikaa_Tech", "24022710", "ĐH Phenikaa"),
            ("HOU_Horizon", "24022820", "ĐH Mở Hà Nội"),
            ("HUP_Pharma", "24022930", "ĐH Dược Hà Nội"),
            ("HNUE_Compass", "24023040", "ĐH Sư Phạm Hà Nội"),
            ("GDU_Vortex", "24023150", "ĐH Gia Định"),
            ("K69_Legends", "24023260", "CLB ICPC K69")
        ]
        tourn["teams"] = []
        for i in range(num_teams):
            name, sid, uni = demo_pool[i % len(demo_pool)]
            tourn["teams"].append({
                "seed": i + 1,
                "bot_id": f"bot_{sid}",
                "student_id": sid,
                "team_name": name,
                "university": uni,
                "code_content": "def decide_move(game_state):\n    return 'ROCK'",
                "language": BotLanguage.PYTHON,
                "elo": 1200 + i * 15
            })
        self.save_tournaments_to_file()
        return {
            "status": "SUCCESS",
            "message": f"Đã nạp đủ {num_teams} đội thi đấu mẫu cho giải!",
            "teams": tourn["teams"],
            "total": len(tourn["teams"]),
            "capacity": num_teams
        }

    def auto_schedule_tournament(self, tournament_id: str) -> dict:
        import random
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        self.ensure_tournament_editable(tourn)
        num_teams = tourn["num_teams"]
        teams = tourn.get("teams", [])
        
        # Nếu chưa đủ số đội theo thể thức giải, tự động bổ sung đội mẫu để đủ điều kiện bốc thăm
        if len(teams) < num_teams:
            demo_pool = [
                ("K69_AlphaBot", "24020001", "ĐHQG Hà Nội"),
                ("BK_DragonBot", "24020002", "ĐH Bách Khoa"),
                ("UET_ThunderBot", "24020003", "Trường ĐH Công Nghệ"),
                ("PTIT_CyberBot", "24020004", "Học Viện BCVT"),
                ("NEU_EconBot", "24020005", "ĐH Kinh Tế QD"),
                ("HCMUT_Vanguard", "24020006", "ĐH Bách Khoa HCM"),
                ("UIT_ShadowBot", "24020007", "ĐH CNTT HCM"),
                ("FPT_PhoenixBot", "24020008", "ĐH FPT Hà Nội"),
                ("VNU_TitanBot", "24020009", "ĐHQG Hà Nội"),
                ("HUST_IronBot", "24020010", "ĐH Bách Khoa"),
                ("K69_NovaBot", "24020011", "Trường ĐH Công Nghệ"),
                ("HNUE_SolarBot", "24020012", "ĐH Sư Phạm"),
                ("UTC_RailBot", "24020013", "ĐH Giao Thông"),
                ("TLU_WaterBot", "24020014", "ĐH Thủy Lợi"),
                ("HAU_ArchBot", "24020015", "ĐH Kiến Trúc"),
                ("VNUA_AgriBot", "24020016", "Học Viện Nông Nghiệp"),
                ("FTU_Pegasus", "24021810", "ĐH Ngoại Thương"),
                ("HU_Falcon", "24021920", "ĐH Huế"),
                ("QNU_Wave", "24022030", "ĐH Quy Nhơn"),
                ("DLU_Pine", "24022140", "ĐH Đà Lạt"),
                ("TNUS_Star", "24022250", "ĐH Thái Nguyên"),
                ("VGU_Eagle", "24022360", "ĐH Việt Đức"),
                ("BUV_Lion", "24022470", "British University VN"),
                ("RMIT_Apex", "24022580", "RMIT University"),
                ("VinUni_Apex", "24022690", "VinUniversity"),
                ("Phenikaa_Tech", "24022710", "ĐH Phenikaa"),
                ("HOU_Horizon", "24022820", "ĐH Mở Hà Nội"),
                ("HUP_Pharma", "24022930", "ĐH Dược Hà Nội"),
                ("HNUE_Compass", "24023040", "ĐH Sư Phạm Hà Nội"),
                ("GDU_Vortex", "24023150", "ĐH Gia Định"),
                ("K69_Legends", "24023260", "CLB ICPC K69"),
                ("AIO_MatrixBot", "24023370", "Viện CNTT")
            ]
            existing_sids = {str(t.get("student_id", "")).strip().lower() for t in teams}
            for name, sid, uni in demo_pool:
                if len(teams) >= num_teams:
                    break
                if sid.lower() not in existing_sids:
                    teams.append({
                        "seed": len(teams) + 1,
                        "bot_id": f"bot_{sid}",
                        "student_id": sid,
                        "team_name": name,
                        "university": uni,
                        "code_content": "def decide_move(game_state):\n    return 'ROCK'",
                        "language": BotLanguage.PYTHON,
                        "elo": 1200
                    })
                    existing_sids.add(sid.lower())

        # Bốc thăm sắp xếp ngẫu nhiên các đội vào sơ đồ thi đấu
        teams_to_schedule = list(teams[:num_teams])
        random.shuffle(teams_to_schedule)
        for idx, t in enumerate(teams_to_schedule):
            t["seed"] = idx + 1
        tourn["teams"] = teams_to_schedule

        # Reset toàn bộ các trận đấu trong nhánh
        tourn["matches"] = Database.build_bracket_matches(num_teams)
        tourn["champion"] = None
        tourn["status"] = "RUNNING"
        
        # Ghép cặp cho Vòng 1 (Level 1)
        num_lvl1_matches = num_teams // 2
        for i in range(num_lvl1_matches):
            m_id = "m_gf" if num_teams == 2 else f"m_lvl1_{i+1}"
            tourn["matches"][m_id]["team_a"] = Database.make_team_slot(teams_to_schedule[2*i])
            tourn["matches"][m_id]["team_b"] = Database.make_team_slot(teams_to_schedule[2*i + 1])
            tourn["matches"][m_id]["status"] = "READY"
            
        self.save_tournaments_to_file()
        return tourn

    def authenticate_match_login(self, tournament_id: str, match_id: str, username: str, password: str, student_id: Optional[str] = None) -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
            
        u_clean = username.strip().lower()
        p_clean = password.strip()
        
        if not u_clean:
            raise ValueError("Vui lòng nhập tài khoản đăng nhập!")
        if not p_clean:
            raise ValueError("Vui lòng nhập mật khẩu!")

        # 1. Kiểm tra tài khoản Admin / Ban Tổ Chức
        if u_clean in ["admin", "bquantri", "btc", "trongtai", "referee"]:
            admin_password = os.getenv("ADMIN_PASSWORD", "")
            if admin_password and hmac.compare_digest(p_clean, admin_password):
                return {
                    "status": "SUCCESS",
                    "role": "ADMIN",
                    "message": "Đăng nhập Ban Tổ Chức (Admin) thành công!",
                    "match": match
                }
            else:
                raise ValueError("Mật khẩu Admin không chính xác!")

        team_a = match.get("team_a")
        team_b = match.get("team_b")

        # Teams authenticate with their registered student ID and deterministic default code.
        match_team_a = False
        if team_a:
            sid_a = team_a.get("student_id", "").strip().lower()
            if u_clean == sid_a:
                match_team_a = True

        if match_team_a:
            expected_code = Database.default_team_access_code(team_a.get("student_id", ""))
            if hmac.compare_digest(p_clean, expected_code):
                team_a["authenticated"] = True
                self.save_tournaments_to_file()
                return {
                    "status": "SUCCESS",
                    "role": "TEAM_A",
                    "side": "team_a",
                    "team": team_a,
                    "message": f"Đăng nhập thành công {team_a['team_name']} (Đội Đỏ)!"
                }
            else:
                raise ValueError("Mật khẩu Đội Đỏ không chính xác!")

        # Authenticate the second side with the same credential check.
        match_team_b = False
        if team_b:
            sid_b = team_b.get("student_id", "").strip().lower()
            if u_clean == sid_b:
                match_team_b = True

        if match_team_b:
            expected_code = Database.default_team_access_code(team_b.get("student_id", ""))
            if hmac.compare_digest(p_clean, expected_code):
                team_b["authenticated"] = True
                self.save_tournaments_to_file()
                return {
                    "status": "SUCCESS",
                    "role": "TEAM_B",
                    "side": "team_b",
                    "team": team_b,
                    "message": f"Đăng nhập thành công {team_b['team_name']} (Đội Xanh)!"
                }
            else:
                raise ValueError("Mật khẩu Đội Xanh không chính xác!")

        # 4. Báo lỗi tài khoản không thuộc trận đấu này
        raise ValueError(f"Tài khoản '{username}' không tồn tại hoặc không được phân quyền tham gia trận đấu này!")

    def update_match_draft_code(self, tournament_id: str, match_id: str, side: str, code: str, language: str = "PYTHON") -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
        team_slot = match.get(side)
        if not team_slot:
            raise ValueError(f"Phe {side} chưa có đội.")
        if not team_slot.get("authenticated"):
            raise ValueError("Team login is required before saving a draft.")
        team_slot["draft_code"] = code
        team_slot["draft_lang"] = language
        team_slot["draft_updated_at"] = time.time()
        return {"status": "SUCCESS", "message": "Đã cập nhật mã soạn thảo nháp", "side": side}

    def run_practice_match(self, code_content: str, language: str = "PYTHON", side: str = "team_a", boss: str = "RANDOM") -> dict:
        boss = (boss or "RANDOM").upper()
        if boss == "AGGRESSIVE":
            benchmark_code = """# -*- coding: utf-8 -*-
import random
def decide_move(game_state):
    turn = game_state.get("turn_number", 1)
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"
    pref = "ROCK" if turn <= 3 else ("SCISSORS" if turn <= 6 else "PAPER")
    return pref if pref in available else random.choice(available)
"""
            boss_name = "Boss 2: Aggressive Bot (Hiếu chiến)"
        elif boss == "ADAPTIVE":
            benchmark_code = """# -*- coding: utf-8 -*-
import random
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"
    history = game_state.get("history", [])
    counter_map = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
    if history:
        last = history[-1]
        opp = last.get("opponent_move") or last.get("their_move")
        if opp in counter_map and counter_map[opp] in available:
            return counter_map[opp]
    return random.choice(available)
"""
            boss_name = "Boss 3: Adaptive Counter (Phản đòn)"
        else:
            benchmark_code = """# -*- coding: utf-8 -*-
import random
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    return random.choice(available) if available else "ROCK"
"""
            boss_name = "Boss 1: Random Bot (Ngẫu nhiên)"

        code_a = code_content if side == "team_a" else benchmark_code
        code_b = benchmark_code if side == "team_a" else code_content
        lang_a = language if side == "team_a" else "PYTHON"
        lang_b = "PYTHON" if side == "team_a" else language
        
        sim_res = Database.simulate_9x9_board_match(code_a, code_b, lang_a, lang_b, 1)
        winner = sim_res["winner_side"]
        
        if side == "team_a":
            user_result = "WIN" if winner == "team_a" else "LOSS"
        else:
            user_result = "WIN" if winner == "team_b" else "LOSS"
            
        return {
            "status": "SUCCESS",
            "winner": winner,
            "win_reason": sim_res.get("win_reason", "Hoàn thành mô phỏng 9x9"),
            "damage": sim_res.get("damage", 15),
            "board_steps": sim_res.get("board_steps", []),
            "final_red_alive": sim_res.get("final_red_alive", 9),
            "final_blue_alive": sim_res.get("final_blue_alive", 9),
            "simulation": sim_res,
            "mystery_tiles": sim_res.get("mystery_tiles", {}),
            "user_result": user_result,
            "user_side": side,
            "benchmark_name": boss_name
        }

    def get_tournament(self, tournament_id: str) -> Optional[dict]:
        return self.tournaments.get(tournament_id)

    def get_all_tournaments(self) -> List[dict]:
        res = []
        for t in self.tournaments.values():
            res.append({
                "tournament_id": t["tournament_id"],
                "name": t["name"],
                "num_teams": t["num_teams"],
                "champion": t.get("champion"),
                "status": t.get("status", "RUNNING"),
                "created_at": t.get("created_at", 0)
            })
        res.sort(key=lambda x: x["created_at"], reverse=True)
        return res

    def authenticate_match_team(self, tournament_id: str, match_id: str, side: str, student_id: str, password: str = "123") -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
        
        team_slot = match.get(side)
        if not team_slot:
            raise ValueError(f"Phe {side} chưa có đội tham gia.")

        expected_code = Database.default_team_access_code(team_slot["student_id"])
        if (student_id.strip().upper() == team_slot["student_id"].strip().upper()
                and hmac.compare_digest(password.strip(), expected_code)):
            team_slot["authenticated"] = True
            return {"status": "SUCCESS", "message": f"Xác thực đội {team_slot['team_name']} thành công!", "team": team_slot}
        else:
            raise ValueError("MSSV hoặc mật khẩu không chính xác cho đội này.")

    def update_match_code(self, tournament_id: str, match_id: str, side: str, code: str, language: str = "PYTHON", explanation: str = "") -> dict:
        from app.sandbox.runner import BotRunner
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
        if match.get("status") == "COMPLETED" or match.get("round_status") == "ROUND_FINISHED":
            raise ValueError("Hiệp đấu đã kết thúc. Chờ hiệp tiếp theo để nộp mã lệnh.")
        team_slot = match.get(side)
        if not team_slot:
            raise ValueError(f"Phe {side} chưa có đội.")

        # Bước kiểm tra và cô lập code bot (Syntax & Dry-run sandbox validation)
        if not team_slot.get("authenticated"):
            raise ValueError("Team login is required before submitting code.")
        if not isinstance(explanation, str) or len(explanation) > 2000:
            raise ValueError("Giải thích không hợp lệ hoặc quá 2.000 ký tự.")
        from app.engine.board_rules import match_rule
        val_res = BotRunner.validate_bot_code(code, language, match_rule(tourn, match))

        # Tạo submission ID và bản ghi lịch sử bài nộp chuẩn Kaggle
        sub_id = f"sub_{uuid.uuid4().hex[:8]}"
        submission = {
            "submission_id": sub_id,
            "match_id": match_id,
            "round_number": match.get("current_round_idx", 1),
            "side": side,
            "team_name": team_slot["team_name"],
            "student_id": team_slot["student_id"],
            "language": language,
            "code": code,
            "submitted_at": time.time(),
            "explanation": explanation.strip(),
            "stage_rule": match_rule(tourn, match),
            "is_valid": val_res["is_valid"],
            "validation_status": "VALIDATED" if val_res["is_valid"] else "INVALID",
            "error_message": val_res.get("error_message"),
            "execution_time_ms": val_res.get("execution_time_ms", 0),
            "test_move": val_res.get("test_move"),
            "is_locked": False
        }

        if "submissions_history" not in match:
            match["submissions_history"] = []
        match["submissions_history"].append(submission)

        team_slot["authenticated"] = True
        team_slot["code_submitted"] = True
        team_slot["code_valid"] = val_res["is_valid"]
        team_slot["validation_error"] = val_res.get("error_message")
        team_slot["active_submission_id"] = sub_id
        team_slot["current_code"] = code
        team_slot["current_lang"] = language
        team_slot["draft_code"] = code
        team_slot["draft_lang"] = language

        # Kiểm tra tính sẵn sàng của cả 2 đội
        team_a = match.get("team_a")
        team_b = match.get("team_b")
        ready_a = bool(team_a and team_a.get("code_valid"))
        ready_b = bool(team_b and team_b.get("code_valid"))
        all_ready = ready_a and ready_b
        match["all_teams_ready"] = all_ready
        if match.get("status") != "COMPLETED":
            match["round_status"] = "READY_FOR_BATTLE" if all_ready else "AWAITING_SUBMISSIONS"

        self.save_tournaments_to_file()
        msg = f"Đã nộp mã lệnh Bot cho {team_slot['team_name']} thành công (Code hợp lệ ✓)!" if val_res["is_valid"] else f"Đã nhận bài nộp nhưng CODE KHÔNG HỢP LỆ: {val_res.get('error_message')}"
        return {
            "status": "SUCCESS" if val_res["is_valid"] else "INVALID_CODE",
            "is_valid": val_res["is_valid"],
            "code_valid": val_res["is_valid"],
            "validation_error": val_res.get("error_message"),
            "submission_id": sub_id,
            "validation": val_res,
            "submission": submission,
            "all_teams_ready": all_ready,
            "message": msg,
            "team": team_slot,
            "match": match
        }

    def quick_fill_demo_bots(self, tournament_id: str, match_id: str) -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
        if (match.get("status") == "COMPLETED" or match.get("battle_running")
                or match.get("round_status") in ("ROUND_FINISHED", "BATTLE_RUNNING")):
            raise ValueError("Chờ hiệp tiếp theo sẵn sàng trước khi nạp bot mẫu.")
        team_a = match.get("team_a")
        team_b = match.get("team_b")
        if not team_a or not team_b:
            raise ValueError("Trận đấu chưa đủ 2 đội.")
            
        py_tpl = (
            "# -*- coding: utf-8 -*-\n"
            "import random\n"
            "def decide_move(game_state):\n"
            "    cards = game_state.get('remaining_cards', {})\n"
            "    avail = [c for c, count in cards.items() if count > 0]\n"
            "    return random.choice(avail) if avail else 'ROCK'\n"
        )
        for side, team in (("team_a", team_a), ("team_b", team_b)):
            code = team.get("current_code") or py_tpl
            language = team.get("current_lang", "PYTHON") if team.get("current_code") else "PYTHON"
            team["authenticated"] = True
            self.update_match_code(tournament_id, match_id, side, code, language)
        ready = match["all_teams_ready"]
        return {"status": "SUCCESS" if ready else "INVALID_CODE",
                "message": "Cả hai bot đã hợp lệ và sẵn sàng." if ready else "Có bot chưa hợp lệ; kiểm tra lỗi bài nộp trước khi bắt đầu.",
                "match": match}

    def reset_match(self, tournament_id: str, match_id: str) -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
        
        match["current_round_idx"] = 1
        match["max_rounds"] = 5
        match["status"] = "READY"
        match["round_status"] = "AWAITING_SUBMISSIONS"
        match["rounds_history"] = []
        match["all_teams_ready"] = False
        match["battle_running"] = False
        match["intermission_ends_at"] = None
        match["winner"] = None
        match["winner_name"] = None
        if match.get("team_a"):
            match["team_a"]["rounds_won"] = 0
            match["team_a"]["hp"] = 100
            match["team_a"]["code_submitted"] = False
            match["team_a"]["code_valid"] = False
            match["team_a"]["validation_error"] = None
            match["team_a"]["active_submission_id"] = None
            match["team_a"]["authenticated"] = False
        if match.get("team_b"):
            match["team_b"]["rounds_won"] = 0
            match["team_b"]["hp"] = 100
            match["team_b"]["code_submitted"] = False
            match["team_b"]["code_valid"] = False
            match["team_b"]["validation_error"] = None
            match["team_b"]["active_submission_id"] = None
            match["team_b"]["authenticated"] = False
        self.save_tournaments_to_file()
        return {"status": "SUCCESS", "message": "Đã đặt lại trận đấu về ban đầu!", "match": match}

    def advance_to_next_round(self, tournament_id: str, match_id: str) -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
        if match["status"] == "COMPLETED":
            return {"status": "COMPLETED", "message": "Trận đấu đã hoàn tất chung cuộc.", "match": match}

        # Kiểm tra điều kiện chuyển round
        if match.get("round_status") == "ROUND_FINISHED" or (match.get("intermission_ends_at") and time.time() >= match["intermission_ends_at"]):
            match["current_round_idx"] += 1
            match["round_status"] = "AWAITING_SUBMISSIONS"
            match["all_teams_ready"] = False
            match["battle_running"] = False
            match["intermission_ends_at"] = None

            # Both sides submit again; their signed login session remains valid.
            if match.get("team_a"):
                match["team_a"]["code_submitted"] = False
                match["team_a"]["code_valid"] = False
                match["team_a"]["validation_error"] = None
                match["team_a"]["active_submission_id"] = None
            if match.get("team_b"):
                match["team_b"]["code_submitted"] = False
                match["team_b"]["code_valid"] = False
                match["team_b"]["validation_error"] = None
                match["team_b"]["active_submission_id"] = None

            self.save_tournaments_to_file()
            return {
                "status": "SUCCESS",
                "message": f"Hệ thống đã tự động chuyển sang chuẩn bị Round {match['current_round_idx']}!",
                "match": match,
                "current_round_idx": match["current_round_idx"],
                "all_teams_ready": match["all_teams_ready"],
                "round_status": match["round_status"],
                "team_a": match.get("team_a"),
                "team_b": match.get("team_b")
            }

        return {"status": "NOOP", "message": "Trận đấu đang ở trạng thái khác, không chuyển round.", "match": match}

    def get_match_submissions(self, tournament_id: str, match_id: str, role: str = "ADMIN", student_id: str = "") -> List[dict]:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
        subs = match.get("submissions_history", [])
        if role.upper() in ["ADMIN", "REFEREE"]:
            return subs
        
        # Lọc cho tuyển thủ (Xem bài nộp của đội mình hoặc tất cả bài nộp trong trận)
        filtered = []
        for s in subs:
            if role.upper() == "TEAM_A" and s.get("side") == "team_a":
                filtered.append(s)
            elif role.upper() == "TEAM_B" and s.get("side") == "team_b":
                filtered.append(s)
            elif student_id and str(s.get("student_id", "")).strip().lower() == str(student_id).strip().lower():
                filtered.append(s)
            elif not student_id or role.upper() in ["TEAM", "GUEST"]:
                filtered.append(s)
        return filtered if filtered else subs

    def get_round_replay(self, tournament_id: str, match_id: str, round_idx: int) -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
        for r in match.get("rounds_history", []):
            if r.get("round_number") == round_idx:
                return {
                    "status": "SUCCESS",
                    "round_record": r,
                    "board_steps": r.get("board_steps", []),
                    "winner": r.get("winner"),
                    "win_reason": r.get("win_reason"),
                    "move_logs": r.get("move_logs", []),
                    "bot_logs": r.get("bot_logs", []),
                    "system_logs": r.get("system_logs", [])
                }
        raise ValueError(f"Không tìm thấy dữ liệu replay cho Round {round_idx}")

    @staticmethod
    def simulate_9x9_board_match(team_a_code: str, team_b_code: str, team_a_lang: str = "PYTHON", team_b_lang: str = "PYTHON", round_num: int = 1, stage_rule: str = "STAGE_1_STANDARD", tie_seed: str = None) -> dict:
        from app.engine.board import simulate_board
        if not tie_seed:
            import uuid
            tie_seed = uuid.uuid4().hex
        return simulate_board(team_a_code, team_b_code, team_a_lang, team_b_lang, round_num, stage_rule, tie_seed, reuse_sandbox=True)

    @staticmethod
    def complete_bracket_match(tourn, match):
        team_a, team_b = match["team_a"], match["team_b"]
        match["status"] = "COMPLETED"
        match["round_status"] = "COMPLETED"
        if team_a["rounds_won"] > team_b["rounds_won"]:
            match["winner"] = "team_a"
            match["winner_name"] = team_a["team_name"]
            win_team = team_a
        elif team_b["rounds_won"] > team_a["rounds_won"]:
            match["winner"] = "team_b"
            match["winner_name"] = team_b["team_name"]
            win_team = team_b
        else:
            if (team_a["hp"] > team_b["hp"] or (team_a["hp"] == team_b["hp"] and int(hashlib.sha256(match["tie_break_seed"].encode()).hexdigest(), 16) % 2 == 0)):
                match["winner"] = "team_a"
                match["winner_name"] = team_a["team_name"]
                win_team = team_a
            else:
                match["winner"] = "team_b"
                match["winner_name"] = team_b["team_name"]
                win_team = team_b

        next_m_id = match.get("next_match_id")
        if next_m_id and next_m_id in tourn["matches"]:
            next_m = tourn["matches"][next_m_id]
            slot = match.get("next_slot", "team_a")
            advanced_team = copy.deepcopy(win_team)
            advanced_team["authenticated"] = True
            advanced_team["rounds_won"] = 0
            advanced_team["hp"] = 100
            advanced_team["code_submitted"] = False
            advanced_team["code_valid"] = False
            advanced_team["validation_error"] = None
            advanced_team["active_submission_id"] = None
            next_m["all_teams_ready"] = False
            next_m[slot] = advanced_team
            if next_m["team_a"] and next_m["team_b"]:
                next_m["status"] = "READY"
        else:
            tourn["champion"] = match["winner_name"]
            tourn["status"] = "FINISHED"

    def upgrade_tournament_rules(self, tournament_id):
        tourn = self.tournaments[tournament_id]
        matches = sorted(tourn.get("matches", {}).values(), key=lambda m: m.get("round_level", 1))
        for match in matches:
            if match.get("status") == "COMPLETED":
                continue
            match["max_rounds"] = 5
            match.setdefault("tie_break_seed", uuid.uuid4().hex)
            history = match.get("rounds_history", [])
            if not history or not match.get("team_a") or not match.get("team_b"):
                continue
            for side in ("team_a", "team_b"):
                match[side]["rounds_won"] = sum(record.get("winner") == side for record in history[:5])
            if len(history) >= 5 or max(match["team_a"]["rounds_won"], match["team_b"]["rounds_won"]) >= 3:
                self.complete_bracket_match(tourn, match)

    def play_match_round(self, tournament_id: str, match_id: str) -> dict:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            raise ValueError("Không tìm thấy giải đấu.")
        match = tourn["matches"].get(match_id)
        if not match:
            raise ValueError("Không tìm thấy trận đấu.")
            
        if match["status"] == "COMPLETED":
            return {"status": "ALREADY_FINISHED", "message": "Trận đấu đã hoàn thành trước đó.", "match": match}
            
        team_a = match.get("team_a")
        team_b = match.get("team_b")
        if not team_a or not team_b:
            raise ValueError("Trận đấu chưa đủ 2 đội tham gia.")

        # Backend bắt buộc xác minh cả hai bài nộp hợp lệ trước khi cho phép bắt đầu
        if not team_a.get("code_valid") or not team_b.get("code_valid"):
            missing = []
            if not team_a.get("code_valid"): missing.append(f"{team_a['team_name']} (Đội Đỏ)")
            if not team_b.get("code_valid"): missing.append(f"{team_b['team_name']} (Đội Xanh)")
            raise ValueError(f"Chưa đủ điều kiện bắt đầu! Các đội sau chưa có mã lệnh hợp lệ: {', '.join(missing)}.")

        if match.get("battle_running"):
            raise ValueError("Trận đấu đang diễn ra trong tiến trình, không thể bắt đầu trùng lặp!")

        # Khóa chính xác 2 phiên bản code của round đang chạy
        match["battle_running"] = True
        sub_a_id = team_a.get("active_submission_id")
        sub_b_id = team_b.get("active_submission_id")
        for sub in match.get("submissions_history", []):
            if sub.get("submission_id") in (sub_a_id, sub_b_id):
                sub["is_locked"] = True

        r_num = match["current_round_idx"]
        from app.engine.board_rules import match_rule
        stage_rule = match_rule(tourn, match)

        # Mô phỏng trận đấu trên Bàn cờ chiến thuật 9x9 trong môi trường cô lập
        sim_res = Database.simulate_9x9_board_match(
            team_a.get("current_code", ""),
            team_b.get("current_code", ""),
            team_a.get("current_lang", "PYTHON"),
            team_b.get("current_lang", "PYTHON"),
            r_num,
            stage_rule,
            uuid.uuid4().hex
        )

        winner_side = sim_res["winner_side"]
        win_reason = sim_res["win_reason"]
        damage = 30 if stage_rule == "STAGE_2_MUTATED" and r_num % 2 == 0 else (20 if stage_rule == "STAGE_4_FINALS" else 15)

        if winner_side == "team_a":
            team_a["rounds_won"] += 1
            team_b["hp"] = max(0, team_b["hp"] - damage)
        elif winner_side == "team_b":
            team_b["rounds_won"] += 1
            team_a["hp"] = max(0, team_a["hp"] - damage)

        # 3 Loại Nhật Ký Chuẩn Hóa: Move Log, Bot Execution Log, System Event Log
        move_logs = [
            {
                "step": st["step_idx"],
                "turn_label": st["turn_label"],
                "log": st["log"],
                "is_clash": bool(st.get("clash_event")),
                "red_alive": st["red_alive"],
                "blue_alive": st["blue_alive"]
            }
            for st in sim_res["board_steps"]
        ]

        bot_logs = [
            {
                "side": "team_a",
                "team_name": team_a["team_name"],
                "lang": team_a.get("current_lang", "PYTHON"),
                "status": "FAILED" if sim_res["bot_errors"]["team_a"] else "EXECUTED",
                "error": sim_res["bot_errors"]["team_a"],
                "preferred_move": sim_res["pref_move_a"],
                "submission_id": sub_a_id,
                "log": f"Bot {team_a['team_name']} (Đỏ): lỗi thực thi, bị xử thua." if sim_res["bot_errors"]["team_a"] else f"Bot {team_a['team_name']} (Đỏ) thực thi thành công: [{sim_res['pref_move_a']}]."
            },
            {
                "side": "team_b",
                "team_name": team_b["team_name"],
                "lang": team_b.get("current_lang", "PYTHON"),
                "status": "FAILED" if sim_res["bot_errors"]["team_b"] else "EXECUTED",
                "error": sim_res["bot_errors"]["team_b"],
                "preferred_move": sim_res["pref_move_b"],
                "submission_id": sub_b_id,
                "log": f"Bot {team_b['team_name']} (Xanh): lỗi thực thi, bị xử thua." if sim_res["bot_errors"]["team_b"] else f"Bot {team_b['team_name']} (Xanh) thực thi thành công: [{sim_res['pref_move_b']}]."
            }
        ]

        now_str = time.strftime("%H:%M:%S")
        system_logs = [
            f"[{now_str}] [Ban Tổ Chức] Phát lệnh KHAI HỎA Round {r_num}. Đã khóa mã nguồn 2 đội ({sub_a_id}, {sub_b_id}).",
            f"[{now_str}] [Game Engine] Khởi tạo bàn cờ 9x9 (81 ô). Quân cờ 2 bên bước vào giao tranh.",
            f"[{now_str}] [Kết Quả Round {r_num}] {win_reason}.",
            f"[{now_str}] [Hệ Thống] Tự động hiển thị bàn cờ kết quả 5 giây trước khi chuyển sang round tiếp theo."
        ]

        round_record = {
            "stage_rule": stage_rule,
            "rules": sim_res.get("rules", {}),
            "round_number": r_num,
            "sub_a_id": sub_a_id,
            "sub_b_id": sub_b_id,
            "team_a_code": team_a["current_code"],
            "team_b_code": team_b["current_code"],
            "team_a_lang": team_a.get("current_lang", "PYTHON"),
            "team_b_lang": team_b.get("current_lang", "PYTHON"),
            "team_a_name": team_a["team_name"],
            "team_b_name": team_b["team_name"],
            "team_a_hp": team_a["hp"],
            "team_b_hp": team_b["hp"],
            "team_a_move": sim_res["pref_move_a"],
            "team_b_move": sim_res["pref_move_b"],
            "winner": winner_side,
            "winner_name": team_a["team_name"] if winner_side == "team_a" else team_b["team_name"],
            "win_reason": win_reason,
            "damage": damage,
            "first_side": sim_res["first_side"],
            "tie_break_seed": sim_res["tie_break_seed"],
            "final_red_alive": sim_res["final_red_alive"],
            "final_blue_alive": sim_res["final_blue_alive"],
            "board_steps": sim_res["board_steps"],
            "mystery_tiles": sim_res.get("mystery_tiles", {}),
            "move_logs": move_logs,
            "bot_logs": bot_logs,
            "system_logs": system_logs,
            "log": f"Round {r_num}: {win_reason}",
            "timestamp": time.time()
        }
        match["rounds_history"].append(round_record)
        match["mystery_tiles"] = sim_res.get("mystery_tiles", {})
        match["battle_running"] = False

        is_completed = False
        if team_a["rounds_won"] >= 3 or team_b["rounds_won"] >= 3 or r_num >= match["max_rounds"]:
            is_completed = True
            self.complete_bracket_match(tourn, match)
        else:
            # Round hoàn tất, chuẩn bị thời gian xem diễn biến trận đấu 5 giây
            match["status"] = "IN_PROGRESS"
            match["round_status"] = "ROUND_FINISHED"
            match["intermission_ends_at"] = time.time() + 5.0

        self.save_tournaments_to_file()
        return {
            "status": "SUCCESS",
            "round_record": round_record,
            "match": match,
            "is_completed": is_completed,
            "winner": winner_side,
            "winner_name": round_record["winner_name"],
            "reason": win_reason,
            "win_reason": win_reason,
            "board_steps": round_record["board_steps"],
            "move_logs": move_logs,
            "bot_logs": bot_logs,
            "system_logs": system_logs,
            "message": f"Hoàn thành Round {r_num}!" if not is_completed else f"Trận đấu đã kết thúc! {match['winner_name']} giành chiến thắng tiến vào vòng trong."
        }

    def get_tournament_teams_overview(self, tournament_id: str) -> List[dict]:
        tourn = self.tournaments.get(tournament_id)
        if not tourn:
            return []
        
        teams_map = {}
        for t in tourn["teams"]:
            sid = t["student_id"]
            teams_map[sid] = {
                "seed": t["seed"],
                "student_id": sid,
                "team_name": t["team_name"],
                "university": t.get("university", "K69"),
                "rounds_won": 0,
                "rounds_played": 0,
                "matches_won": 0,
                "matches_played": 0,
                "current_stage": "Tứ Kết" if tourn["num_teams"] == 8 else "Bán Kết",
                "status": "Đang tham gia",
                "elo": t.get("elo", 1200)
            }

        for m in tourn["matches"].values():
            if m["rounds_history"]:
                ta = m.get("team_a")
                tb = m.get("team_b")
                if ta and ta["student_id"] in teams_map:
                    teams_map[ta["student_id"]]["rounds_won"] += ta["rounds_won"]
                    teams_map[ta["student_id"]]["rounds_played"] += len(m["rounds_history"])
                if tb and tb["student_id"] in teams_map:
                    teams_map[tb["student_id"]]["rounds_won"] += tb["rounds_won"]
                    teams_map[tb["student_id"]]["rounds_played"] += len(m["rounds_history"])

            if m["status"] == "COMPLETED" and m["winner_name"]:
                win_name = m["winner_name"]
                for tinfo in teams_map.values():
                    if tinfo["team_name"] == win_name:
                        tinfo["matches_won"] += 1
                        if m["round_name"] == "Tứ Kết":
                            tinfo["current_stage"] = "Bán Kết"
                            tinfo["status"] = "Đã vào Bán Kết"
                        elif m["round_name"] == "Bán Kết":
                            tinfo["current_stage"] = "Chung Kết"
                            tinfo["status"] = "Đã vào Chung Kết"
                        elif m["round_name"] == "Chung Kết":
                            tinfo["current_stage"] = "Quán Quân"
                            tinfo["status"] = "VÔ ĐỊCH TOÀN GIẢI"

        res = list(teams_map.values())
        res.sort(key=lambda x: (x["matches_won"], x["rounds_won"]), reverse=True)
        return res

# Khởi tạo singleton database instance
db = Database()
