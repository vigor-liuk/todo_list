import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand, dueTasks, markReminded, parseTasks, serializeTasks, validateTasks } from '../shared/tasks.mjs'
import { occurrenceDate, projectTask, recurrenceLabel } from '../shared/recurrence.mjs'
import { TaskStore } from '../electron/store.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const task = () => ({ id: 'english', title: '学英语', note: '', category: '课内', priority: '中', due: '2026-09-22T20:00', done: false, reminded: false,
  recurrence: { frequency: 'daily', start: '2026-09-22', time: '20:00', minutes: 30, records: {} } })
const time = value => new Date(value).getTime()

test('daily completion resets next day without duplicating tasks and retains timing through export', () => {
  let tasks = applyCommand([], { type: 'upsert', task: task() })
  tasks = applyCommand(tasks, { type: 'start', id: 'english' }, time('2026-09-22T20:00'))
  tasks = applyCommand(tasks, { type: 'complete', id: 'english' }, time('2026-09-22T20:30'))
  tasks = parseTasks(serializeTasks(tasks))
  assert.equal(tasks.length, 1)
  assert.equal(projectTask(tasks[0], '2026-09-22').done, true)
  assert.equal(projectTask(tasks[0], '2026-09-23').done, false)
  assert.equal(projectTask(tasks[0], '2026-09-23').startedAt, undefined)
  assert.equal(projectTask(tasks[0], '2026-09-22').completedAt, new Date('2026-09-22T20:30').toISOString())
  assert.equal(recurrenceLabel(tasks[0]), '每天 20:00 · 目标 30 分钟')
  tasks = applyCommand(tasks, { type: 'toggle', id: 'english', due: '2026-09-22T20:00' }, time('2026-09-23T12:00'))
  assert.equal(projectTask(tasks[0], '2026-09-22').done, false)
})

test('reminders fire once per local occurrence, skip missed days, and survive desktop restart', t => {
  const dir = mkdtempSync(join(tmpdir(), 'little-day-recurring-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  let store = new TaskStore(dir)
  store.command({ type: 'upsert', task: task() })
  assert.equal(store.tick(time('2026-09-22T19:59')).length, 0)
  assert.equal(store.tick(time('2026-09-22T20:00')).length, 1)
  store = new TaskStore(dir)
  assert.equal(store.tick(time('2026-09-22T21:00')).length, 0)
  assert.equal(store.tick(time('2026-09-25T21:00')).length, 1)
  assert.equal(store.alerts[0].due, '2026-09-25T20:00')
  assert.equal(store.tasks.length, 1)
  assert.equal(store.tick(time('2026-09-25T21:01')).length, 0)
})

test('weekly and monthly schedules respect start, weekday, short months and leap years', () => {
  const rule = { ...task().recurrence, frequency: 'weekly' }
  assert.equal(occurrenceDate(rule, '2026-09-01'), '2026-09-22')
  assert.equal(occurrenceDate(rule, '2026-09-23'), '2026-09-29')
  rule.frequency = 'monthly'; rule.start = '2024-01-31'
  assert.equal(occurrenceDate(rule, '2024-02-01'), '2024-02-29')
  assert.equal(occurrenceDate(rule, '2025-02-01'), '2025-02-28')
  assert.equal(occurrenceDate(rule, '2025-03-01'), '2025-03-31')
})

test('editing after rollover preserves history and uses the new occurrence reminder state', () => {
  let tasks = markReminded([task()], dueTasks([task()], time('2026-09-22T20:00')))
  const next = { ...projectTask(tasks[0], '2026-09-23'), title: '英语阅读' }
  tasks = applyCommand(tasks, { type: 'upsert', task: next }, time('2026-09-23T09:00'))
  assert.equal(dueTasks(tasks, time('2026-09-23T20:00')).length, 1)
  assert.equal(tasks[0].recurrence.records['2026-09-22'].reminded, true)
})

test('running sessions can finish across midnight before the next occurrence begins', () => {
  let tasks = applyCommand([task()], { type: 'start', id: 'english' }, time('2026-09-22T23:50'))
  assert.equal(projectTask(tasks[0], '2026-09-23').due, '2026-09-22T20:00')
  tasks = applyCommand(tasks, { type: 'complete', id: 'english' }, time('2026-09-23T00:20'))
  assert.equal(projectTask(tasks[0], '2026-09-23').done, false)
  assert.equal(tasks[0].recurrence.records['2026-09-22'].done, true)
})

test('invalid recurrence data fails import and old tasks remain compatible', () => {
  for (const change of [{ start: '2026-02-30' }, { time: '25:00' }, { frequency: 'yearly' }, { minutes: 0 }, { records: { bad: {} } }, { records: { '2026-09-22': { done: 'yes', reminded: false } } }]) {
    assert.throws(() => validateTasks([{ ...task(), recurrence: { ...task().recurrence, ...change } }]))
  }
  const { recurrence: _rule, ...single } = task()
  assert.deepEqual(parseTasks(serializeTasks([single])), [single])
})
