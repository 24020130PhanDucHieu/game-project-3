import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const frontend = join(root, 'frontend')
const publicDir = join(frontend, 'public')
const output = join(frontend, 'out')
const destination = join(frontend, 'dist')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(args, env = process.env) {
  const command = process.platform === 'win32' ? 'cmd.exe' : npm
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', npm, ...args] : args
  const result = spawnSync(command, commandArgs, { cwd: frontend, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function removeIfPresent(path) {
  if (!existsSync(path)) return
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Refusing to remove symlink: ${path}`)
  rmSync(path, { recursive: true, force: true })
}

for (const name of ['static', 'assets', 'sw.js', 'offline-assets.json']) {
  removeIfPresent(join(publicDir, name))
}
removeIfPresent(join(frontend, 'generated', 'portal.json'))

if (!existsSync(join(frontend, 'node_modules', 'next'))) run(['ci'])
run(['run', 'build'], { ...process.env, ARENA_STATIC_EXPORT: '1', NEXT_TELEMETRY_DISABLED: '1' })

const html = readFileSync(join(output, 'index.html'), 'utf8')
if (!html.includes('/_next/')) throw new Error('Next export did not contain the application')

removeIfPresent(destination)
mkdirSync(destination)
cpSync(output, destination, { recursive: true })
console.log(`Cloudflare frontend built: ${destination}`)
