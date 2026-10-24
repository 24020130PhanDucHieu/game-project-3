/* Service worker: giữ giao diện, engine offline và Pyodide trong bộ nhớ đệm để mất mạng vẫn mở trang, kiểm tra mã và đấu thử boss. */
const VERSION = 'arena-offline-v3'
const SHELL = `${VERSION}-shell`
const STATIC = `${VERSION}-static`
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/offline/worker.js', '/offline/engine/manifest.json'])).catch(() => undefined))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

// File tĩnh (JS/WASM/ZIP) mà máy chủ trả về trang HTML là trang dự phòng của SPA (file chưa có): không được lưu.
function isHtml(response) { return (response.headers.get('content-type') || '').includes('text/html') }

async function cacheFirst(request, name) {
  const cached = await caches.match(request)
  if (cached && !isHtml(cached)) return cached
  if (cached) await (await caches.open(name)).delete(request)
  const response = await fetch(request)
  // Không lưu response "opaque" (không đọc được): trả nó cho request kiểu khác sẽ làm Pyodide lỗi.
  if (response.ok && response.type !== 'opaque' && !isHtml(response)) (await caches.open(name)).put(request, response.clone())
  return response
}

async function networkFirst(request, name) {
  try {
    const response = await fetch(request)
    if (response.ok) (await caches.open(name)).put(request, response.clone())
    return response
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' })
    if (cached) return cached
    if (request.mode === 'navigate') { const shell = await caches.match('/'); if (shell) return shell }
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.href.startsWith(PYODIDE)) { event.respondWith(cacheFirst(request, STATIC)); return }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return // dữ liệu thật luôn đi qua mạng
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/offline/pyodide/')) { event.respondWith(cacheFirst(request, STATIC)); return }
  if (request.mode === 'navigate' || url.pathname.startsWith('/offline/') || /\.(png|svg|jpg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL))
  }
})
