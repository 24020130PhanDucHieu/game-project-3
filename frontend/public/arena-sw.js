/* Service worker: giữ giao diện, engine offline và Pyodide trong bộ nhớ đệm để mất mạng vẫn mở trang, kiểm tra mã và đấu thử boss. */
const VERSION = 'arena-offline-v5'
const SHELL = `${VERSION}-shell`
const STATIC = `${VERSION}-static`
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/'
const API = `${VERSION}-api`

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

// Mạng treo không được làm trang đứng: quá hạn thì rơi về bản lưu (nếu có).
function fetchWithTimeout(request, ms = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function networkFirst(request, name) {
  try {
    const response = await fetchWithTimeout(request)
    if (response.ok) (await caches.open(name)).put(request, response.clone())
    return response
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' })
    if (cached) return cached
    if (request.mode === 'navigate') { const shell = await caches.match('/'); if (shell) return shell }
    throw error
  }
}

// Dữ liệu API (GET) luôn lấy từ máy chủ; bản lưu chỉ dùng khi mất mạng, để tải lại trang lúc offline vẫn vào được trận
// và luyện tập. Khóa lưu gắn với phiên đăng nhập nên mỗi tài khoản chỉ thấy dữ liệu của mình.
async function apiKey(request) {
  const auth = request.headers.get('authorization') || ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth))
  const user = [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
  const url = new URL(request.url)
  url.searchParams.set('__arena_user', user)
  return url.href
}

async function apiNetworkFirst(request) {
  const key = await apiKey(request)
  try {
    const response = await fetchWithTimeout(request, 25000)
    if (response.ok && response.type !== 'opaque') (await caches.open(API)).put(key, response.clone())
    return response
  } catch (error) {
    const cached = await caches.match(key)
    if (cached) return cached
    throw error
  }
}

const API_SKIP = /\/api\/(auth\/|time|.*snapshots\/file)/

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.href.startsWith(PYODIDE)) { event.respondWith(cacheFirst(request, STATIC)); return }
  if (url.pathname.startsWith('/api/') && !API_SKIP.test(url.pathname)) { event.respondWith(apiNetworkFirst(request)); return }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/offline/pyodide/')) { event.respondWith(cacheFirst(request, STATIC)); return }
  if (request.mode === 'navigate' || url.pathname.startsWith('/offline/') || /\.(png|svg|jpg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL))
  }
})
