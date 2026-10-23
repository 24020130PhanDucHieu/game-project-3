'use client'

import { ThemeProvider } from '@/lib/theme'
import { LiveProvider } from './live/context'
import { Shell } from './live/shell'

/**
 * Giao diện chính của Arena. Mọi dữ liệu lấy trực tiếp từ API/WebSocket của gateway;
 * xem components/arena/live/ để biết cách các tab được ánh xạ với backend.
 */
export function ArenaApp() {
  return (
    <ThemeProvider>
      <LiveProvider>
        <Shell />
      </LiveProvider>
    </ThemeProvider>
  )
}
