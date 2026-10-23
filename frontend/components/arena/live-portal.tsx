'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window { arenaPortalBoot?: Promise<void> }
}

/** The tournament runtime owns this DOM subtree; React only mounts it once. */
export function LivePortal({ html, scripts }: { html: string; scripts: string[] }) {
  const failure = useRef<HTMLDivElement>(null)
  useEffect(() => {
    window.arenaPortalBoot ??= (async () => {
      for (const src of scripts) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = src
          script.async = false
          script.onload = () => resolve()
          script.onerror = () => reject(new Error(`Không tải được ${src}`))
          document.body.appendChild(script)
        })
      }
    })()
    window.arenaPortalBoot.catch(() => {
      if (failure.current) failure.current.hidden = false
    })
  }, [scripts])
  return <>
    <div ref={failure} hidden role="alert" style={{ padding: 20, background: '#fff1f2', color: '#9f1239' }}>
      Không tải được giao diện. Kiểm tra kết nối rồi <button onClick={() => location.reload()}>Tải lại trang</button>.
    </div>
    <div id="arena-live-portal" dangerouslySetInnerHTML={{ __html: html }} />
  </>
}
