'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const KEY = 'arena.theme'
const Ctx = createContext<{ mode: ThemeMode; resolved: 'light' | 'dark'; setMode: (mode: ThemeMode) => void } | null>(null)

/** Chạy trước khi React hydrate để tránh nháy sáng/tối. */
export const themeBootScript = `try{var m=localStorage.getItem('${KEY}')||'dark';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}try{var n=navigator,c=n.connection;if((n.deviceMemory&&n.deviceMemory<=4)||(n.hardwareConcurrency&&n.hardwareConcurrency<=4)||(c&&c.saveData))document.documentElement.dataset.fx='lite'}catch(e){}`

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [dark, setDark] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved)
    } catch {
      /* không đọc được lưu trữ: dùng theo hệ thống */
    }
  }, [])

  useEffect(() => {
    const apply = () => {
      const next = mode === 'dark' || (mode === 'system' && systemDark())
      setDark(next)
      document.documentElement.classList.toggle('dark', next)
      document.documentElement.style.colorScheme = next ? 'dark' : 'light'
    }
    apply()
    if (mode !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* bỏ qua */
    }
  }, [])

  const value = useMemo(() => ({ mode, resolved: (dark ? 'dark' : 'light') as 'light' | 'dark', setMode }), [mode, dark, setMode])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
