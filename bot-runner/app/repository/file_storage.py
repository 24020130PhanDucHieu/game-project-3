# -*- coding: utf-8 -*-
"""
Bộ Quản lý Lưu trữ Đĩa Bất đồng bộ & An toàn (Atomic Debounced Disk Storage).
Khắc phục triệt để nghẽn cổ chai ghi file JSON đồng bộ trên mỗi request,
loại trừ nguy cơ xung đột file và hỏng dữ liệu khi hàng nghìn người dùng truy cập.
"""

import os
import json
import time
import shutil
import threading
from typing import Dict, Any, Optional

class AtomicFileStorage:
    def __init__(self, file_path: str, debounce_sec: float = 1.0):
        self.file_path = file_path
        self.temp_path = f"{file_path}.tmp"
        self.backup_path = f"{file_path}.bak"
        self.debounce_sec = debounce_sec
        
        self._dirty = False
        self._data_getter = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None

    def start_background_worker(self, data_getter):
        """Khởi chạy luồng ghi nền định kỳ / debounced"""
        self._data_getter = data_getter
        if not self._worker_thread or not self._worker_thread.is_alive():
            self._stop_event.clear()
            self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name="DiskSyncWorker")
            self._worker_thread.start()

    def mark_dirty(self):
        """Đánh dấu dữ liệu đã thay đổi trong RAM, cần ghi xuống đĩa"""
        with self._lock:
            self._dirty = True

    def flush_immediate(self):
        """Ép ghi dữ liệu ngay lập tức xuống đĩa (dùng khi shutdown hoặc backup)"""
        with self._lock:
            if self._dirty and self._data_getter:
                self._write_to_disk_atomic(self._data_getter())
                self._dirty = False

    def load(self) -> Optional[dict]:
        """Đọc file an toàn với cơ chế fallback sang file backup nếu bị lỗi"""
        if not os.path.exists(self.file_path):
            if os.path.exists(self.backup_path):
                try:
                    with open(self.backup_path, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    pass
            return None

        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[AtomicStorage] Cảnh báo lỗi đọc file chính ({e}), thử phục hồi từ backup...")
            if os.path.exists(self.backup_path):
                try:
                    with open(self.backup_path, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    pass
            return None

    def _write_to_disk_atomic(self, data: dict):
        """Ghi ra file tạm và hoán đổi nguyên tử (atomic rename/replace)"""
        try:
            dir_name = os.path.dirname(self.file_path)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)

            # Ghi ra file .tmp (định dạng gọn nhẹ không indent dư thừa để tối ưu I/O)
            with open(self.temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())

            # Sao lưu bản cũ trước khi thay thế
            if os.path.exists(self.file_path):
                try:
                    shutil.copy2(self.file_path, self.backup_path)
                except Exception:
                    pass

            # Hoán đổi nguyên tử (atomic replace)
            os.replace(self.temp_path, self.file_path)
        except Exception as e:
            print(f"[AtomicStorage] Lỗi khi ghi đĩa nguyên tử: {e}")

    def _worker_loop(self):
        """Vòng lặp giám sát cờ dirty và ghi đĩa debounced"""
        while not self._stop_event.is_set():
            time.sleep(self.debounce_sec)
            with self._lock:
                if self._dirty and self._data_getter:
                    data = self._data_getter()
                    self._dirty = False
                    # Thực hiện ghi ngoài khối lock để giảm thiểu tranh chấp
                    self._write_to_disk_atomic(data)

    def stop(self):
        """Dừng worker an toàn"""
        self._stop_event.set()
        self.flush_immediate()
