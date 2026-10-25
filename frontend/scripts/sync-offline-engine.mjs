// Chuẩn bị máy chấm offline trong trình duyệt:
//  1. Sao chép engine Python thật của máy chấm vào public/offline/engine.
//  2. Tải lõi Pyodide (gói npm) vào public/offline/pyodide để không phụ thuộc CDN
//     (mạng trường học hay chặn cdn.jsdelivr.net). Tải một lần, lần sau dùng lại.
// Chạy tự động trước dev/build. Lỗi mạng khi tải Pyodide chỉ cảnh báo: worker sẽ thử CDN.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public', 'offline')
const source = join(here, '..', '..', 'bot-runner', 'app', 'engine')
const target = join(publicDir, 'engine')
const files = ['board.py', 'board_rules.py', 'rules.py']
// Giải AI: chỉ gửi phần công khai (đối thủ công khai + vòng chấm). Các nhóm đối thủ ẩn (hidden.py) không bao giờ xuống trình duyệt.
const aicupSource = join(here, '..', '..', 'bot-runner', 'app', 'aicup')
const aicupFiles = ['opponents.py', 'suite.py']

if (existsSync(source)) {
  mkdirSync(target, { recursive: true })
  const hash = createHash('sha256')
  for (const file of files) {
    copyFileSync(join(source, file), join(target, file))
    hash.update(readFileSync(join(source, file)))
  }
  mkdirSync(join(target, 'aicup'), { recursive: true })
  for (const file of aicupFiles) {
    copyFileSync(join(aicupSource, file), join(target, 'aicup', file))
    hash.update(readFileSync(join(aicupSource, file)))
  }
  writeFileSync(join(target, 'manifest.json'), JSON.stringify({ files, aicup: aicupFiles, version: hash.digest('hex').slice(0, 12) }, null, 2) + '\n')
  console.log('[offline-engine] Đã đồng bộ', [...files, ...aicupFiles.map((f) => 'aicup/' + f)].join(', '))
} else {
  console.log('[offline-engine] Không thấy bot-runner, dùng bản engine đã có trong public/offline.')
}

const PYODIDE_VERSION = '0.27.2'
const PYODIDE_FILES = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']
const pyDir = join(publicDir, 'pyodide')
const stamp = join(pyDir, 'VERSION')

/** Đọc các file cần thiết từ một tarball npm (định dạng tar ustar, đã gunzip). */
function untar(buffer, wanted) {
  const out = new Map()
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '')
    if (!name) break
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '')
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8)
    const full = (prefix ? prefix + '/' : '') + name
    const base = full.replace(/^package\//, '')
    const start = offset + 512
    if (wanted.includes(base)) out.set(base, buffer.subarray(start, start + size))
    offset = start + Math.ceil(size / 512) * 512
  }
  return out
}

async function syncPyodide() {
  if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === PYODIDE_VERSION && PYODIDE_FILES.every((f) => existsSync(join(pyDir, f)))) {
    console.log(`[offline-engine] Pyodide ${PYODIDE_VERSION} đã có sẵn trong public/offline/pyodide`)
    return
  }
  const url = `https://registry.npmjs.org/pyodide/-/pyodide-${PYODIDE_VERSION}.tgz`
  console.log(`[offline-engine] Đang tải Pyodide ${PYODIDE_VERSION} từ npm…`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`)
  const tar = gunzipSync(Buffer.from(await res.arrayBuffer()))
  const found = untar(tar, PYODIDE_FILES)
  const missing = PYODIDE_FILES.filter((f) => !found.has(f))
  if (missing.length) throw new Error('Gói Pyodide thiếu file: ' + missing.join(', '))
  mkdirSync(pyDir, { recursive: true })
  for (const [name, data] of found) writeFileSync(join(pyDir, name), data)
  writeFileSync(stamp, PYODIDE_VERSION + '\n')
  const total = [...found.values()].reduce((sum, d) => sum + d.length, 0)
  console.log(`[offline-engine] Đã lưu Pyodide (${(total / 2 ** 20).toFixed(1)} MB) vào public/offline/pyodide`)
}

try {
  await syncPyodide()
} catch (error) {
  console.warn('[offline-engine] Không tải được Pyodide, máy chấm offline sẽ thử CDN:', error.message)
}
