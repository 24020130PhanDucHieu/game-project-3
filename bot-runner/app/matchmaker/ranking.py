# -*- coding: utf-8 -*-
"""
Hệ thống Tính điểm Elo Đa người chơi và Xếp hạng Giải đấu (Multiplayer Elo Rating).
"""

from typing import Dict, List, Tuple
import math

class EloCalculator:
    K_FACTOR = 32

    @staticmethod
    def calculate_pairwise_expected(ra: float, rb: float) -> float:
        """Kỳ vọng thắng của A trước B"""
        return 1.0 / (1.0 + math.pow(10, (rb - ra) / 400.0))

    @staticmethod
    def update_multiplayer_elo(
        current_ratings: Dict[str, int],
        ranks: Dict[str, int] # rank: 1, 2, 3...
    ) -> Dict[str, int]:
        """
        Cập nhật Elo cho N người chơi trong một phòng đấu.
        ranks: {bot_id: 1} (thứ hạng)
        Trả về: {bot_id: new_elo}
        """
        n = len(current_ratings)
        if n < 2:
            return current_ratings

        new_ratings = {}
        pids = list(current_ratings.keys())

        # Điểm thực tế theo thứ hạng (Hạng 1 -> cao nhất)
        actual_scores = {}
        for pid in pids:
            r = ranks.get(pid, n)
            # Chuẩn hóa điểm từ 1.0 (hạng 1) xuống 0.0 (hạng bét)
            actual_scores[pid] = (n - r) / (n - 1) if n > 1 else 0.5

        for i, pid in enumerate(pids):
            ra = current_ratings[pid]
            # Tổng kỳ vọng trước tất cả các đối thủ còn lại
            expected_total = 0.0
            for j, opp_id in enumerate(pids):
                if i != j:
                    rb = current_ratings[opp_id]
                    expected_total += EloCalculator.calculate_pairwise_expected(ra, rb)

            expected_avg = expected_total / (n - 1)
            actual_score = actual_scores[pid]

            elo_change = int(EloCalculator.K_FACTOR * (actual_score - expected_avg))
            new_ratings[pid] = max(100, ra + elo_change)

        return new_ratings
