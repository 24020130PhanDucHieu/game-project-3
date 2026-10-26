const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('../../frontend/node_modules/typescript')
function cache() {
  const source = fs.readFileSync(require.resolve('../../frontend/lib/cache.ts'), 'utf8') + '\nexport { load as testLoad };'
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: () => ({}) })
  return exports
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
test('an old bank response cannot undo an optimistic toggle', async () => {
  const c = cache(), pending = deferred()
  const old = c.testLoad('ai:bank', () => pending.promise, true, 10000)
  c.updateCache('ai:bank', () => ({ entries: [{ id: 'a', enabled: false }] }))
  pending.resolve({ entries: [{ id: 'a', enabled: true }] })
  await old
  assert.equal(c.readCache('ai:bank').entries[0].enabled, false)
})
test('an invalidated read cannot overwrite a newer refreshed bank', async () => {
  const c = cache(), pending = deferred()
  const old = c.testLoad('ai:bank', () => pending.promise, true, 10000)
  c.invalidate('ai:bank')
  await c.testLoad('ai:bank', async () => ({ entries: [{ id: 'a', enabled: false }] }), true, 10000)
  pending.resolve({ entries: [{ id: 'a', enabled: true }] })
  await old
  assert.equal(c.readCache('ai:bank').entries[0].enabled, false)
})
test('separate row updates preserve each other and unrelated cache keys', async () => {
  const c = cache()
  c.updateCache('other', () => 'keep')
  c.updateCache('ai:bank', () => ({ entries: [{ id: 'a', enabled: true }, { id: 'b', enabled: true }] }))
  for (const id of ['a', 'b']) c.updateCache('ai:bank', d => ({ ...d, entries: d.entries.map(e => e.id === id ? { ...e, enabled: false } : e) }))
  assert.ok(c.readCache('ai:bank').entries.every(e => !e.enabled))
  assert.equal(c.readCache('other'), 'keep')
})
