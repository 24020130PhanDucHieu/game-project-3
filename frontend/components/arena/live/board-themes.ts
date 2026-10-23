'use client'

import { useCallback, useEffect, useState } from 'react'

/** Một bộ giao diện cho bàn cờ; dùng chung cho 2D (CSS) và 3D (three.js) nên chỉ dùng mã màu hex. */
export type BoardTheme = {
  id: string
  label: string
  /** Màu ô sáng / ô tối */
  cellA: string
  cellB: string
  /** Khung bàn và nền xung quanh */
  frame: string
  backdrop: string
  /** Màu hai đội và ánh sáng của quân */
  red: string
  blue: string
  /** Ô cứ điểm */
  baseRed: string
  baseBlue: string
  /** Màu nhấn (va chạm, ô đặc biệt) */
  accent: string
  obstacle: string
  /** Màu ánh sáng môi trường 3D */
  ambient: string
  fog: string
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'neon', label: 'Neon Cyber', cellA: '#1b1f45', cellB: '#12163a', frame: '#7c5cff', backdrop: '#0a0c24', red: '#ff4d6d', blue: '#35c9ff', baseRed: '#ff4d6d', baseBlue: '#35c9ff', accent: '#ffe066', obstacle: '#3a3f7a', ambient: '#8b7bff', fog: '#0a0c24' },
  { id: 'wood', label: 'Gỗ cổ điển', cellA: '#e8c99b', cellB: '#b98551', frame: '#5b3a1e', backdrop: '#2a1a0e', red: '#c62828', blue: '#1565c0', baseRed: '#e53935', baseBlue: '#1e88e5', accent: '#ffd54f', obstacle: '#4e342e', ambient: '#ffe0b2', fog: '#2a1a0e' },
  { id: 'ocean', label: 'Đại dương', cellA: '#2a7fa8', cellB: '#1c5d82', frame: '#0b3a57', backdrop: '#06202f', red: '#ff7a59', blue: '#7df9ff', baseRed: '#ff7a59', baseBlue: '#7df9ff', accent: '#fff59d', obstacle: '#0b3a57', ambient: '#a6e3ff', fog: '#06202f' },
  { id: 'forest', label: 'Rừng xanh', cellA: '#5f9e57', cellB: '#437a42', frame: '#2b4a22', backdrop: '#0f2013', red: '#ef5350', blue: '#4fc3f7', baseRed: '#ef5350', baseBlue: '#4fc3f7', accent: '#fff176', obstacle: '#2b4a22', ambient: '#c8f7c5', fog: '#0f2013' },
  { id: 'lava', label: 'Núi lửa', cellA: '#4a2a26', cellB: '#2e1a18', frame: '#ff6a2b', backdrop: '#160a08', red: '#ff3d2e', blue: '#ffb74d', baseRed: '#ff3d2e', baseBlue: '#ffb74d', accent: '#ffee58', obstacle: '#1a0f0d', ambient: '#ff9a62', fog: '#160a08' },
  { id: 'marble', label: 'Cẩm thạch', cellA: '#f4f6fb', cellB: '#c9cfdf', frame: '#8890a8', backdrop: '#e7eaf3', red: '#e0245e', blue: '#2563eb', baseRed: '#e0245e', baseBlue: '#2563eb', accent: '#f59e0b', obstacle: '#7b839c', ambient: '#ffffff', fog: '#e7eaf3' },
]

const KEY = 'arena.boardTheme'

export function useBoardTheme(): [BoardTheme, (id: string) => void] {
  const [id, setId] = useState('neon')
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved && BOARD_THEMES.some((t) => t.id === saved)) setId(saved)
    } catch { /* bỏ qua */ }
  }, [])
  const choose = useCallback((next: string) => {
    setId(next)
    try { localStorage.setItem(KEY, next) } catch { /* bỏ qua */ }
  }, [])
  return [BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0], choose]
}

/**
 * Cứ điểm nhà của mỗi đội (đội kia phải chiếm ô này để thắng). Theo engine: mục tiêu của Đỏ (team_a) là
 * (col 8, row 0) — cứ điểm của Xanh; mục tiêu của Xanh (team_b) là (col 0, row 8) — cứ điểm của Đỏ.
 */
export const BASES = { red: { col: 0, row: 8 }, blue: { col: 8, row: 0 } } as const

export const PIECE_ICON: Record<string, { icon: string; label: string }> = {
  ROCK: { icon: '✊', label: 'Búa' },
  PAPER: { icon: '✋', label: 'Bao' },
  SCISSORS: { icon: '✌️', label: 'Kéo' },
  JOKER: { icon: '🃏', label: 'Joker' },
}
