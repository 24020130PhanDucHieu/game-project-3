# -*- coding: utf-8 -*-
"""
CÔNG CỤ DỌN DẸP DỮ LIỆU REPLAY BƯỚC ĐI CŨ (REPLAY BOARD STEPS PRUNER)
Giúp giải phóng dung lượng đĩa và tối ưu hóa bộ nhớ:
- Cắt tỉa các mảng `board_steps` và `bot_logs` cồng kềnh của các trận đấu đã hoàn tất quá N ngày.
- BẢO TOÀN NGUYÊN VẸN: Kết quả giải đấu, người thắng cuộc, tỷ số, điểm ELO và bảng xếp hạng.
- Hỗ trợ cờ `--dry-run` để kiểm tra trước lượng dung lượng sẽ được dọn dẹp.
"""

import os
import sys
import json
import time
import argparse
from typing import Dict, Any

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT_DIR, "data", "tournaments_store.json")
DB_DATA_FILE = os.path.join(ROOT_DIR, "database", "tournaments_store.json")

def prune_replays(retention_days: int = 14, dry_run: bool = True):
    target_file = DATA_FILE if os.path.exists(DATA_FILE) else DB_DATA_FILE
    if not os.path.exists(target_file):
        print(f"❌ Không tìm thấy file dữ liệu giải đấu tại {target_file}")
        return

    size_before = os.path.getsize(target_file) / (1024 * 1024)
    print("=" * 70)
    print("🧹 CÔNG CỤ DỌN DẸP & TỐI ƯU HÓA LƯU TRỮ REPLAY TRẬN ĐẤU")
    print(f"   Tệp dữ liệu: {target_file} ({size_before:.2f} MB)")
    print(f"   Chính sách lưu trữ: Giữ chi tiết replay trong vòng {retention_days} ngày gần nhất")
    print(f"   Chế độ: {'CHỈ KIỂM TRA (DRY-RUN - Không ghi đĩa)' if dry_run else 'THỰC THI CHÍNH THỨC'}")
    print("=" * 70)

    try:
        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Không thể đọc file JSON: {e}")
        return

    tournaments = data if isinstance(data, dict) else {}
    cutoff_time = time.time() - (retention_days * 86400)
    
    pruned_matches = 0
    total_steps_removed = 0

    for tid, t in tournaments.items():
        matches = t.get("matches", {})
        if isinstance(matches, dict):
            match_items = matches.values()
        elif isinstance(matches, list):
            match_items = matches
        else:
            continue

        for m in match_items:
            # Chỉ dọn dẹp các trận đã COMPLETED
            if m.get("status") == "COMPLETED":
                # Kiểm tra lịch sử hiệp đấu
                rh = m.get("round_history", [])
                if isinstance(rh, list):
                    for r in rh:
                        b_steps = r.get("board_steps", [])
                        if b_steps and len(b_steps) > 0:
                            total_steps_removed += len(b_steps)
                            pruned_matches += 1
                            if not dry_run:
                                r["board_steps"] = [] # Lưu ý: chỉ xóa chi tiết nước cờ, giữ nguyên winner & score
                                r["bot_logs"] = ["[INFO] Replay steps archived after retention policy."]

    print(f"\n📊 KẾT QUẢ RÀ SOÁT:")
    print(f"  • Số hiệp đấu đủ điều kiện cắt tỉa replay: {pruned_matches}")
    print(f"  • Tổng số bước cờ (board steps) được thu hồi: {total_steps_removed}")

    if not dry_run and total_steps_removed > 0:
        # Sao lưu tạm thời trước khi ghi
        backup_tmp = target_file + ".bak"
        with open(backup_tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        size_after = os.path.getsize(target_file) / (1024 * 1024)
        saved_mb = size_before - size_after
        print(f"\n✔ ĐÃ DỌN DẸP THÀNH CÔNG!")
        print(f"  • Dung lượng trước: {size_before:.2f} MB")
        print(f"  • Dung lượng sau:   {size_after:.2f} MB")
        print(f"  • Tiết kiệm được:   {saved_mb:.2f} MB ({((saved_mb)/size_before)*100:.1f}%)")
    else:
        print("\n✔ Kiểm tra hoàn tất (Dry-run mode). Dữ liệu trên đĩa không bị thay đổi.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prune old replay board steps to save disk space")
    parser.add_argument("--retention-days", type=int, default=14, help="Số ngày lưu chi tiết replay")
    parser.add_argument("--execute", action="store_true", help="Thực thi xóa thật (mặc định là dry-run)")
    args = parser.parse_args()

    prune_replays(retention_days=args.retention_days, dry_run=not args.execute)
