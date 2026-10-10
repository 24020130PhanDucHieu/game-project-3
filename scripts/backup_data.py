# -*- coding: utf-8 -*-
"""
Script Sao lưu Dữ liệu Tự động & Snapshot An toàn (Data Backup & Snapshot Script).
Chạy định kỳ (cron job) hoặc trước khi cập nhật hệ thống để bảo toàn dữ liệu giải đấu.
"""

import os
import shutil
import time
import glob
import sys

def backup_data():
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_file = os.path.join(project_dir, "data", "tournaments_store.json")
    backup_dir = os.path.join(project_dir, "database", "backups")
    os.makedirs(backup_dir, exist_ok=True)

    if not os.path.exists(data_file):
        print(f"[Backup] Không tìm thấy file dữ liệu: {data_file}")
        return False

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_name = f"tournaments_backup_{timestamp}.json"
    backup_path = os.path.join(backup_dir, backup_name)

    try:
        shutil.copy2(data_file, backup_path)
        size_kb = round(os.path.getsize(backup_path) / 1024, 2)
        print(f"[Backup] Sao lưu thành công: {backup_path} ({size_kb} KB)")

        # Dọn dẹp bản sao lưu cũ quá 30 ngày (giữ lại tối thiểu 10 bản gần nhất)
        backups = sorted(glob.glob(os.path.join(backup_dir, "tournaments_backup_*.json")))
        if len(backups) > 10:
            for old_b in backups[:-10]:
                try:
                    os.remove(old_b)
                    print(f"[Backup] Đã dọn dẹp bản sao lưu cũ: {os.path.basename(old_b)}")
                except Exception:
                    pass

        return True
    except Exception as e:
        print(f"[Backup] Lỗi khi sao lưu dữ liệu: {e}")
        return False

if __name__ == "__main__":
    success = backup_data()
    sys.exit(0 if success else 1)
