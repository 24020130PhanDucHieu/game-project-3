# -*- coding: utf-8 -*-
"""
Bộ nhớ đệm In-Memory siêu nhanh (High-Performance In-Memory Cache with TTL & Stampede Protection).
Tối ưu hóa phản hồi cho các endpoint được hàng nghìn sinh viên polling liên tục (10,000+ RPS).
"""

import time
import hashlib
import json
import threading
from typing import Dict, Any, Optional, Tuple, Callable

class CacheItem:
    def __init__(self, data_bytes: bytes, etag: str, expires_at: float, version: int):
        self.data_bytes = data_bytes
        self.etag = etag
        self.expires_at = expires_at
        self.version = version

class FastMemoryCache:
    def __init__(self):
        self._cache: Dict[str, CacheItem] = {}
        self._lock = threading.Lock()
        self._compute_locks: Dict[str, threading.Lock] = {}
        self._locks_lock = threading.Lock()

    def _get_compute_lock(self, key: str) -> threading.Lock:
        with self._locks_lock:
            if key not in self._compute_locks:
                self._compute_locks[key] = threading.Lock()
            return self._compute_locks[key]

    def get(self, key: str) -> Optional[Tuple[bytes, str]]:
        """Lấy dữ liệu thô (raw bytes) và etag nếu còn hạn"""
        now = time.time()
        with self._lock:
            item = self._cache.get(key)
            if item and item.expires_at > now:
                return item.data_bytes, item.etag
        return None

    def set(self, key: str, data: Any, ttl: float = 2.0, version: int = 0) -> Tuple[bytes, str]:
        """Lưu trữ dữ liệu đã serialize thành bytes kèm etag"""
        if isinstance(data, (bytes, bytearray)):
            raw_bytes = bytes(data)
        elif isinstance(data, str):
            raw_bytes = data.encode("utf-8")
        else:
            raw_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")

        etag = hashlib.md5(raw_bytes).hexdigest()
        expires_at = time.time() + ttl

        item = CacheItem(
            data_bytes=raw_bytes,
            etag=etag,
            expires_at=expires_at,
            version=version
        )
        with self._lock:
            self._cache[key] = item
        return raw_bytes, etag

    def get_or_compute(self, key: str, compute_fn: Callable[[], Any], ttl: float = 2.0, version: int = 0) -> Tuple[bytes, str]:
        """
        SingleFlight Pattern: Ngăn chặn Cache Stampede (hàng nghìn request đồng thời cùng tính toán)
        Chỉ 1 request được thực hiện compute, các request khác chờ và nhận kết quả từ cache.
        """
        # 1. Thử lấy từ cache nhanh
        cached = self.get(key)
        if cached:
            return cached

        # 2. Khóa tính toán theo key (SingleFlight)
        compute_lock = self._get_compute_lock(key)
        with compute_lock:
            # Kiểm tra lại lần 2 (Double-checked locking)
            cached = self.get(key)
            if cached:
                return cached

            data = compute_fn()
            return self.set(key, data, ttl=ttl, version=version)

    def invalidate(self, key: str):
        """Xóa cache của 1 key cụ thể"""
        with self._lock:
            self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str):
        """Xóa tất cả các cache có tiền tố khớp (ví dụ: 'tournament_tourn_123')"""
        with self._lock:
            keys_to_del = [k for k in self._cache.keys() if k.startswith(prefix)]
            for k in keys_to_del:
                self._cache.pop(k, None)

    def clear(self):
        """Xóa toàn bộ cache"""
        with self._lock:
            self._cache.clear()

fast_cache = FastMemoryCache()
