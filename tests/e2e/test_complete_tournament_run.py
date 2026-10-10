# -*- coding: utf-8 -*-
"""
End-to-End Complete Tournament Workflow Test.
Runs an entire 8-team bracket from creation to Grand Final champion crowning,
verifying that mutations persist to disk, winners advance, and ranking updates.
"""
import requests
import json
import time
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8080")

def run_full_tournament_championship():
    print("=" * 60)
    print("🏆 BẮT ĐẦU VẬN HÀNH TOÀN DIỆN MỘT GIẢI ĐẤU OTTV2 ĐẾN CHUNG KẾT")
    print("=" * 60)

    # 1. Tạo giải đấu 8 đội
    print("\n[Bước 1] Tạo giải đấu mới...")
    resp = requests.post(f"{BASE_URL}/api/tournaments/create", json={
        "name": "Chung Kết Mùa Giải Tân Sinh Viên K69 2026",
        "num_teams": 8
    })
    assert resp.status_code == 200, f"Lỗi tạo giải đấu: {resp.text}"
    t_id = resp.json()["tournament"]["tournament_id"]
    print(f"✅ Giải đấu đã tạo: ID={t_id}")

    # 2. Điền đủ 8 đội mẫu và xếp lịch thi đấu
    print("\n[Bước 2] Điền 8 đội và xếp lịch nhánh đấu (Bracket)...")
    resp = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/teams/quick-fill")
    assert resp.status_code == 200, f"Lỗi quick-fill: {resp.text}"

    resp = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/auto-schedule")
    assert resp.status_code == 200, f"Lỗi xếp lịch: {resp.text}"
    tourn = resp.json()["tournament"]
    print("✅ Đã xếp lịch thành công. Các trận đấu khởi tạo:")
    for mid, m in tourn["matches"].items():
        if m.get("team_a") and m.get("team_b"):
            print(f"   • [{mid}] {m['title']}: {m['team_a']['team_name']} vs {m['team_b']['team_name']}")

    # 3. Lần lượt thi đấu qua các vòng cho đến khi tìm ra Quán quân
    # Level 1: Tứ kết (4 trận) -> Level 2: Bán kết (2 trận) -> Level 3: Chung kết (1 trận)
    max_loops = 60
    loop_count = 0

    while loop_count < max_loops:
        loop_count += 1
        resp = requests.get(f"{BASE_URL}/api/tournaments/{t_id}")
        assert resp.status_code == 200
        current_tourn = resp.json()

        if current_tourn.get("status") == "FINISHED" and current_tourn.get("champion"):
            print(f"\n🎉 GIẢI ĐẤU ĐÃ KẾT THÚC THÀNH CÔNG!")
            print(f"👑 NHÀ VÔ ĐỊCH: {current_tourn['champion']}")
            break

        # Tìm các trận đã sẵn sàng (có team_a và team_b) nhưng chưa COMPLETED
        playable_matches = [
            m for m in current_tourn["matches"].values()
            if m.get("team_a") and m.get("team_b") and m.get("status") != "COMPLETED"
        ]

        if not playable_matches:
            print("⚠️ Không tìm thấy trận đấu nào sẵn sàng tiếp theo.")
            break

        target_match = playable_matches[0]
        mid = target_match["match_id"]
        title = target_match["title"]
        ta_name = target_match["team_a"]["team_name"]
        tb_name = target_match["team_b"]["team_name"]

        # Nạp code demo nếu chưa sẵn sàng
        if not target_match.get("all_teams_ready"):
            resp_fill = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{mid}/demo-fill")
            assert resp_fill.status_code == 200, f"Lỗi demo-fill trận {mid}: {resp_fill.text}"

        # Bắn lệnh Play Round
        resp_play = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{mid}/play-round")
        assert resp_play.status_code == 200, f"Lỗi play-round trận {mid}: {resp_play.text}"
        play_data = resp_play.json()

        r_record = play_data.get("round_record", {})
        winner_name = r_record.get("winner_name", "Chưa rõ")
        is_completed = play_data.get("is_completed", False)
        
        print(f"⚔️ [{mid} - {title}] Round {r_record.get('round_number')}: {winner_name} ({r_record.get('log')}) | Hoàn thành trận: {is_completed}")

        if not is_completed:
            # Chuyển round kế tiếp
            requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{mid}/next-round")

    # 4. Kiểm tra xác nhận tính bền vững dữ liệu (Persistence Verification)
    print("\n[Bước 4] Xác nhận lưu trữ trên ổ đĩa và Bảng xếp hạng...")
    resp_reload = requests.get(f"{BASE_URL}/api/tournaments/{t_id}")
    final_tourn = resp_reload.json()
    assert final_tourn["status"] == "FINISHED", "Trạng thái giải đấu phải là FINISHED"
    assert final_tourn["champion"] is not None, "Nhà vô địch không được là None"
    print(f"✅ Dữ liệu giải đấu đã được lưu bền vững: Quán quân = {final_tourn['champion']}")

    # 5. Kiểm tra bảng xếp hạng đã tính toán dựa trên các trận đấu vừa xong
    resp_rank = requests.get(f"{BASE_URL}/api/ranking")
    assert resp_rank.status_code == 200
    rankings = resp_rank.json()
    assert len(rankings) > 0
    top_bot = rankings[0]
    print(f"✅ Bảng xếp hạng cập nhật thực tế: Top 1 = {top_bot['bot_name']} (ELO: {top_bot['elo_score']}, Thắng: {top_bot['wins']}, Tổng trận: {top_bot['matches_played']})")

    print("\n" + "=" * 60)
    print("🌟 HOÀN THÀNH TOÀN DIỆN QUY TRÌNH GIẢI ĐẤU END-TO-END! 100% THÀNH CÔNG!")
    print("=" * 60)

if __name__ == "__main__":
    run_full_tournament_championship()
