// Sao chép engine Python thật của máy chấm vào public/offline/engine để chạy thử offline trong trình duyệt (Pyodide).
// Chạy tự động trước dev/build; nếu không có thư mục bot-runner (build riêng frontend) thì giữ bản đã commit.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, '..', '..', 'bot-runner', 'app', 'engine')
const target = join(here, '..', 'public', 'offline', 'engine')
const files = ['board.py', 'board_rules.py', 'rules.py']

if (!existsSync(source)) {
  console.log('[offline-engine] Không thấy bot-runner, dùng bản engine đã có trong public/offline.')
  process.exit(0)
}
mkdirSync(target, { recursive: true })
const hash = createHash('sha256')
for (const file of files) {
  copyFileSync(join(source, file), join(target, file))
  hash.update(readFileSync(join(source, file)))
}
writeFileSync(join(target, 'manifest.json'), JSON.stringify({ files, version: hash.digest('hex').slice(0, 12) }, null, 2) + '\n')
console.log('[offline-engine] Đã đồng bộ', files.join(', '))
