import test from 'node:test'
import assert from 'node:assert/strict'
import { nextGoal } from '../src/recommendations.ts'
import { applyCommand, parseTasks, serializeTasks } from '../shared/tasks.mjs'
import { goalTitle, localDate } from '../shared/recommendation-record.mjs'

function task(id, day, goal, done = false) {
  const plan = { title: goalTitle('run', goal), note: '按自己的节奏', minutes: 10, goal }
  return { id, ...plan, category: '个人', priority: '低', due: '', done, reminded: false,
    recommendation: { candidateId: id, date: day, acceptedAt: `${day}T10:00:00Z`, area: '运动休息', series: 'run', trackProgress: true, goal, minutes: 10, original: { ...plan, title: goalTitle('run', 1), goal: 1 }, accepted: plan, changes: [], completedDate: done ? day : '' } }
}

test('timed recommendations preserve history and synchronize completion dates through corrections and reopening', () => {
  const start = new Date(2026, 8, 21, 23, 30).getTime()
  const end = new Date(2026, 8, 22, 0, 30).getTime()
  let tasks = applyCommand([task('a', '2026-09-21', 0.5)], { type: 'start', id: 'a' }, start)
  tasks = applyCommand(tasks, { type: 'complete', id: 'a' }, end)
  assert.equal(tasks[0].recommendation.completedDate, localDate(new Date(end)))
  assert.equal(tasks[0].startedAt, new Date(start).toISOString())
  assert.deepEqual(parseTasks(serializeTasks(tasks)), tasks)
  const corrected = new Date(2026, 8, 21, 23, 50).toISOString()
  tasks = applyCommand(tasks, { type: 'upsert', task: { ...tasks[0], completedAt: corrected } })
  assert.equal(tasks[0].recommendation.completedDate, '2026-09-21')
  tasks = applyCommand(tasks, { type: 'toggle', id: 'a' })
  assert.equal(tasks[0].recommendation.completedDate, '')
  assert.equal(tasks[0].startedAt, undefined)
  assert.equal(tasks[0].completedAt, undefined)
  tasks = applyCommand(tasks, { type: 'start', id: 'a' }, start)
  tasks = applyCommand(tasks, { type: 'complete', id: 'a' }, end)
  tasks = applyCommand(tasks, { type: 'upsert', task: { ...tasks[0], recommendation: { ...tasks[0].recommendation, goal: 0.3 } } })
  assert.equal(tasks[0].done, false)
  assert.equal(tasks[0].startedAt, undefined)
  assert.equal(tasks[0].completedAt, undefined)
  assert.equal(tasks[0].recommendation.completedDate, '')
  assert.equal(tasks[0].recommendation.accepted.goal, 0.5)
})

test('progression uses adjusted targets and only advances after two distinct completed days', () => {
  assert.equal(nextGoal('run', [], '2026-09-23').goal, 1)
  const first = task('a', '2026-09-20', 0.5, true)
  const second = task('b', '2026-09-21', 0.5, false)
  assert.equal(nextGoal('run', [first, second], '2026-09-23').goal, 0.5)
  second.done = true; second.recommendation.completedDate = '2026-09-21'
  assert.equal(nextGoal('run', [first, second], '2026-09-23').goal, 0.7)
  second.recommendation.completedDate = '2026-09-20'
  assert.equal(nextGoal('run', [first, second], '2026-09-23').goal, 0.5)
  const lower = task('c', '2026-09-22', 0.3, true)
  assert.equal(nextGoal('run', [first, second, lower], '2026-09-23').goal, 0.3)
  assert.equal(nextGoal('run', [first, task('d', '2026-09-23', 0.5, true)], '2026-09-23').goal, 0.5)
})

test('original and accepted plans persist atomically with later edits and exports', () => {
  const initial = task('a', '2026-09-20', 0.5)
  let tasks = applyCommand([], { type: 'upsert', task: initial })
  tasks = applyCommand(tasks, { type: 'toggle', id: 'a' })
  assert.ok(tasks[0].recommendation.completedDate)
  const edited = { ...tasks[0], title: goalTitle('run', 0.3), recommendation: { ...tasks[0].recommendation, goal: 0.3 } }
  tasks = applyCommand(tasks, { type: 'upsert', task: edited })
  assert.equal(tasks[0].done, false)
  assert.equal(tasks[0].recommendation.completedDate, '')
  const record = tasks[0].recommendation
  assert.equal(record.original.goal, 1)
  assert.equal(record.accepted.goal, 0.5)
  assert.equal(record.changes[0].goal, 0.3)
  assert.equal(nextGoal('run', tasks, '2026-09-24').goal, 0.3)
  assert.deepEqual(parseTasks(serializeTasks(tasks)), tasks)
  assert.deepEqual(applyCommand([], { type: 'import', text: serializeTasks(tasks) }), tasks)
  tasks = applyCommand(tasks, { type: 'upsert', task: { ...tasks[0], title: '今天只散步，不跑步' } })
  assert.equal(tasks[0].recommendation.trackProgress, false)
  assert.equal(tasks[0].recommendation.accepted.title, goalTitle('run', 0.5))
  assert.equal(tasks[0].recommendation.changes.length, 2)
  assert.throws(() => parseTasks(JSON.stringify([{ ...tasks[0], recommendation: { ...record, goal: -1 } }])))
})
