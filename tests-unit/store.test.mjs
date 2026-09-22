import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { TaskStore } from '../electron/store.mjs'
import { parseTasks, serializeTasks, applyCommand } from '../shared/tasks.mjs'

const task = (changes = {}) => ({ id: 'one', title: '到期任务', note: '', category: '个人', priority: '中', due: '2020-01-01T09:00', done: false, reminded: false, ...changes })
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'little-day-unit-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return { dir, store: new TaskStore(dir) }
}
test('atomic persistence, reminder deduplication after restart, and changed due time', t => {
  const { dir, store } = fixture(t)
  store.command({ type: 'upsert', task: task() })
  assert.equal(store.tick().length, 1)
  const reopened = new TaskStore(dir)
  assert.equal(reopened.tick().length, 0)
  // A stale editor must not reset a reminder already delivered by the main process.
  reopened.command({ type: 'upsert', task: task({ title: '编辑标题' }) })
  assert.equal(reopened.tick().length, 0)
  reopened.command({ type: 'upsert', task: task({ due: '2020-01-02T09:00' }) })
  assert.equal(reopened.tick().length, 1)
  assert.deepEqual(readdirSync(dir), ['tasks.json'])
})
test('invalid imports and damaged startup data never overwrite original', t => {
  const { dir, store } = fixture(t)
  store.command({ type: 'upsert', task: task() })
  const before = readFileSync(store.file, 'utf8')
  for (const text of ['{broken', '{"version":2,"tasks":[]}', JSON.stringify([task(), task()]), JSON.stringify([task({ due: '2026-02-30T12:00' })])]) {
    assert.throws(() => store.command({ type: 'import', text }))
    assert.equal(readFileSync(store.file, 'utf8'), before)
  }
  writeFileSync(store.file, '{broken')
  assert.throws(() => new TaskStore(dir))
  assert.equal(readFileSync(store.file, 'utf8'), '{broken')
})
test('import merges new tasks, keeps local duplicates and backs up pre-import state', t => {
  const { store } = fixture(t)
  store.command({ type: 'upsert', task: task() })
  store.command({ type: 'import', text: JSON.stringify([task({ title: '旧版本标题', category: '工作' }), task({ id: 'two', category: '学习' })]) })
  assert.equal(store.tasks.length, 2)
  assert.equal(store.tasks[0].title, '到期任务')
  assert.equal(store.tasks[0].category, '个人')
  assert.equal(store.tasks[1].category, '课内')
  assert.equal(parseTasks(readFileSync(`${store.file}.before-import.bak`, 'utf8'))[0].category, '个人')
  assert.deepEqual(parseTasks(serializeTasks(store.tasks)), store.tasks)
  store.command({ type: 'import', text: serializeTasks([]) })
  assert.equal(store.tasks.length, 2)
  store.command({ type: 'import', text: serializeTasks(store.tasks) })
  assert.equal(store.tasks.length, 2)
})
test('merging an older export preserves delivered reminders and supports recovering missing tasks', t => {
  const { store, dir } = fixture(t)
  store.command({ type: 'upsert', task: task() })
  store.tick()
  store.command({ type: 'import', text: serializeTasks([task(), task({ id: 'recovered', due: '' })]) })
  assert.equal(store.tick().length, 0)
  assert.equal(store.alerts.length, 1)
  const reopened = new TaskStore(dir)
  assert.deepEqual(reopened.tasks.map(t => t.id), ['one', 'recovered'])
  assert.equal(reopened.tasks[0].reminded, true)
})
test('completed and undated tasks do not remind; wake catches up once', t => {
  const { store } = fixture(t)
  store.command({ type: 'import', text: serializeTasks([task({ done: true }), task({ id: 'two', due: '' }), task({ id: 'three', due: '2028-01-01T12:00' })]) })
  assert.equal(store.tick(new Date('2028-01-01T11:59').getTime()).length, 0)
  assert.deepEqual(store.tick(new Date('2028-01-01T13:00').getTime()).map(t => t.id), ['three'])
  assert.equal(store.tick(new Date('2028-01-01T14:00').getTime()).length, 0)
})
test('failed writes preserve in-memory state and do not claim reminder delivery', t => {
  const { store, dir } = fixture(t)
  store.command({ type: 'upsert', task: task() })
  const before = readFileSync(store.file, 'utf8')
  const original = store.file
  store.file = join(dir, 'missing', 'tasks.json')
  assert.throws(() => store.command({ type: 'delete', id: 'one' }))
  assert.throws(() => store.tick())
  assert.equal(store.tasks[0].reminded, false)
  assert.equal(store.alerts.length, 0)
  assert.equal(readFileSync(original, 'utf8'), before)
})
test('validation checks types, size, dates and command names', () => {
  assert.throws(() => parseTasks(' '.repeat(10 * 1024 * 1024 + 1)))
  assert.throws(() => serializeTasks([task({ done: 'false' })]))
  assert.throws(() => serializeTasks([task({ due: '2025-02-29T10:00' })]))
  assert.doesNotThrow(() => serializeTasks([task({ due: '2028-02-29T10:00' })]))
  assert.throws(() => applyCommand([], { type: 'arbitrary' }))
})

test('start and completion persist across restart, export and import', t => {
  const { store, dir } = fixture(t)
  store.command({ type: 'upsert', task: task() })
  const started = applyCommand(store.tasks, { type: 'start', id: 'one' }, Date.parse('2026-09-21T23:30:00.000Z'))
  store.commit(started)
  const reopened = new TaskStore(dir)
  const again = applyCommand(reopened.tasks, { type: 'start', id: 'one' }, Date.parse('2026-09-22T00:00:00.000Z'))
  assert.equal(again[0].startedAt, '2026-09-21T23:30:00.000Z')
  const completed = applyCommand(again, { type: 'complete', id: 'one' }, Date.parse('2026-09-22T00:30:00.000Z'))
  assert.equal(completed[0].completedAt, '2026-09-22T00:30:00.000Z')
  assert.equal(completed[0].done, true)
  assert.deepEqual(applyCommand(completed, { type: 'complete', id: 'one' }), completed)
  assert.deepEqual(applyCommand(completed, { type: 'start', id: 'one' }), completed)
  reopened.commit(completed)
  assert.deepEqual(new TaskStore(dir).tasks, completed)
  assert.deepEqual(applyCommand([], { type: 'import', text: serializeTasks(completed) }), completed)
  assert.deepEqual(applyCommand(completed, { type: 'toggle', id: 'one' }), [task()])
})

test('legacy tasks remain undated; completion without starting does not invent a duration', () => {
  const old = task({ done: true })
  assert.deepEqual(parseTasks(serializeTasks([old])), [old])
  const [completed] = applyCommand([task()], { type: 'toggle', id: 'one' }, Date.parse('2026-09-22T08:00:00.000Z'))
  assert.equal(completed.startedAt, undefined)
  assert.equal(completed.completedAt, '2026-09-22T08:00:00.000Z')
})

test('invalid timing imports and clock rollback cannot replace stored data', t => {
  const { store } = fixture(t)
  const valid = task({ startedAt: '2026-09-22T08:00:00.000Z' })
  store.command({ type: 'upsert', task: valid })
  const before = readFileSync(store.file, 'utf8')
  for (const changes of [
    { startedAt: null }, { startedAt: 42 }, { startedAt: '2026-02-30T08:00:00.000Z' },
    { completedAt: '2026-09-22T09:00:00.000Z' },
    { done: true }, { done: true, completedAt: '2026-09-22T07:00:00.000Z' },
  ]) {
    assert.throws(() => store.command({ type: 'import', text: JSON.stringify([{ ...valid, ...changes, id: 'invalid' }]) }))
    assert.equal(readFileSync(store.file, 'utf8'), before)
  }
  assert.throws(() => applyCommand(store.tasks, { type: 'complete', id: 'one' }, Date.parse('2026-09-22T07:00:00.000Z')), /早于/)
  assert.deepEqual(store.tasks, [valid])
})
