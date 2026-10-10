# -*- coding: utf-8 -*-
"""
Bộ kiểm soát tần suất truy cập In-Memory (Sliding-Window Rate Limiter).
Bảo vệ hệ thống trước tấn công từ chối dịch vụ (DDoS), vòng lặp request vô tận từ script sinh viên,
và hiện tượng Thundering Herd mà KHÔNG cần cài đặt thêm Redis.
"""

import time
import threading
from typing import Dict, List, Tuple
from collections import defaultdict

class SlidingWindowRateLimiter:
    def __init__(self, default_limit: int = 600, window_sec: int = 60):
        self.default_limit = default_limit
        self.window_sec = window_sec
        # client_ip -> list of timestamps
        self._history: Dict[str, List[float]] = defaultdict(list)
        self._lock = threading.Lock()
        self._last_cleanup = time.time()

    def is_allowed(self, client_id: str, limit: int = None) -> Tuple[bool, int]:
        """
        Kiểm tra xem client có vượt quá giới hạn trong cửa sổ thời gian hay không.
        Trả về: (được_phép: bool, thời_gian_chờ_giây: int)
        """
        now = time.time()
        max_req = limit or self.default_limit
        cutoff = now - self.window_sec

        with self._lock:
            # Dọn dẹp định kỳ 60 giây / lần
            if now - self._last_cleanup > 60:
                self._cleanup_stale(now)
                self._last_cleanup = now

            timestamps = self._history[client_id]
            # Loại bỏ các mốc thời gian ngoài cửa sổ
            while timestamps and timestamps[0] < cutoff:
                timestamps.pop(0)

            if len(timestamps) >= max_req:
                # Tính thời gian chờ cho request đầu tiên hết hạn
                retry_after = int(timestamps[0] + self.window_sec - now) + 1
                return False, max(1, retry_after)

            timestamps.append(now)
            return True, 0

    def _cleanup_stale(self, now: float):
        cutoff = now - self.window_sec
        stale_keys = []
        for cid, ts_list in self._history.items():
            while ts_list and ts_list[0] < cutoff:
                ts_list.pop(0)
            if not ts_list:
                stale_keys.append(cid)
        for k in stale_keys:
            del self._history[k]

rate_limiter = SlidingWindowRateLimiter()
