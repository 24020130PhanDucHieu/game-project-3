'use client'

import { useSyncExternalStore } from 'react'

const subscribe = (l: () => void) => {
  window.addEventListener('online', l)
  window.addEventListener('offline', l)
  return () => { window.removeEventListener('online', l); window.removeEventListener('offline', l) }
}

/** Trạng thái mạng của trình duyệt (true khi có mạng). */
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
