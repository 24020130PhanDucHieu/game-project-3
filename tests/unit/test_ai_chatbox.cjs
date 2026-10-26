// Run: node --test tests/unit/test_ai_chatbox.cjs
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../../frontend/node_modules/typescript')
const root = path.resolve(__dirname, '../..')

function load(file, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, AbortController, Error, TypeError, ...globals })
  return exports
}
const usage = { available: true, remaining: 30, limit: 30 }
function store(api = {}) {
  return load('frontend/lib/ai-store.ts', { require: () => ({ arenaApi: { getAiUsage: async () => usage, ...api } }) }).aiStore
}
function deferred() {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const reply = { answer: 'Có nguồn', remaining: 29, sources: [] }

test('temporary 429 and 503 do not exhaust quota or disable the assistant', async () => {
  for (const status of [429, 503]) {
    const s = store({ askAi: async () => { throw Object.assign(new Error('Temporary'), { status }) } })
    await s.refreshUsage()
    await s.ask('câu hỏi')
    await new Promise(setImmediate)
    assert.equal(s.get().remaining, 30)
    assert.equal(s.get().available, true)
    assert.equal(s.get().busy, false)
  }
})

test('actual exhausted quota is obtained from usage', async () => {
  let remaining = 30
  const s = store({ getAiUsage: async () => ({ ...usage, remaining }), askAi: async () => {
    remaining = 0
    throw Object.assign(new Error('Daily limit'), { status: 429 })
  } })
  await s.refreshUsage()
  await s.ask('câu hỏi')
  await new Promise(setImmediate)
  assert.equal(s.get().remaining, 0)
})

test('temporary usage failure keeps known state and recovers', async () => {
  let fail = false
  const s = store({ getAiUsage: async () => { if (fail) throw new Error('Network'); return usage } })
  await s.refreshUsage()
  fail = true
  await s.refreshUsage()
  assert.equal(s.get().available, true)
  assert.equal(s.get().usageError, true)
  fail = false
  await s.refreshUsage()
  assert.equal(s.get().usageError, false)
})

test('cancel aborts request and late completion cannot unlock a newer question', async () => {
  const a = deferred(), b = deferred()
  const calls = []
  const s = store({ askAi: (q, t, signal) => { calls.push(signal); return calls.length === 1 ? a.promise : b.promise } })
  const first = s.ask('first')
  s.cancel()
  assert.equal(calls[0].aborted, true)
  assert.equal(s.get().busy, false)
  const second = s.ask('second')
  a.resolve({ ...reply, remaining: 1 })
  await first
  assert.equal(s.get().busy, true)
  assert.notEqual(s.get().remaining, 1)
  b.resolve(reply)
  await second
  assert.equal(s.get().busy, false)
  assert.equal(s.get().messages.filter(m => m.pending).length, 0)
})

test('scope changes discard both old replies and old usage results', async () => {
  const a = deferred(), u = deferred(), b = deferred()
  let calls = 0
  const s = store({ getAiUsage: () => u.promise, askAi: () => ++calls === 1 ? a.promise : b.promise })
  s.resetOnScope('A')
  const oldUsage = s.refreshUsage()
  const first = s.ask('first')
  s.resetOnScope('B')
  const second = s.ask('second')
  a.resolve(reply)
  u.resolve({ ...usage, remaining: 2 })
  await Promise.all([first, oldUsage])
  assert.equal(s.get().busy, true)
  assert.equal(s.get().remaining, null)
  assert.equal(s.get().messages.length, 2)
  b.resolve(reply)
  await second
})

test('a usage read started before a question cannot overwrite its new quota', async () => {
  const u = deferred()
  const s = store({ getAiUsage: () => u.promise, askAi: async () => reply })
  const pending = s.refreshUsage()
  await s.ask('câu hỏi')
  u.resolve(usage)
  await pending
  assert.equal(s.get().remaining, 29)
})

test('new conversation cancels pending work without losing known quota', async () => {
  const pending = deferred()
  const s = store({ askAi: () => pending.promise })
  await s.refreshUsage()
  const request = s.ask('câu hỏi')
  s.clear()
  pending.reject(new Error('Late failure'))
  await request
  assert.equal(s.get().messages.length, 0)
  assert.equal(s.get().busy, false)
  assert.equal(s.get().remaining, 30)
})

function client(fetch) {
  return load('frontend/lib/api-client.ts', { fetch, Headers, FormData, process: { env: {} }, setTimeout, clearTimeout }).arenaApi
}
test('AI transport does not repeat a possibly accepted POST after network failure', async () => {
  let calls = 0
  const api = client(async () => { calls++; throw new TypeError('Failed to fetch') })
  await assert.rejects(api.askAi('câu hỏi'), /Failed to fetch/)
  assert.equal(calls, 1)
})
test('cancel signal reaches fetch and immediately ends the waiting request', async () => {
  const controller = new AbortController()
  let reached
  const api = client((url, options) => new Promise((resolve, reject) => {
    reached = options.signal
    reached.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
  }))
  const pending = api.askAi('câu hỏi', undefined, controller.signal)
  controller.abort()
  await assert.rejects(pending, /Aborted/)
  assert.equal(reached.aborted, true)
})
