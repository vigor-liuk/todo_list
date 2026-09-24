import { localDate, validateRecord } from './recommendation-record.mjs'
import { projectTask, projectOccurrence, occurrenceState } from './recurrence.mjs'
export const storageKey = 'little-day-tasks-v1'
export const maxBytes = 10 * 1024 * 1024
export const categories = ['课内', '课外', '生活', '个人']

export function validateTasks(value) {
  const tasks = Array.isArray(value) ? value : value?.version === 1 ? value.tasks : null
  if (!Array.isArray(tasks) || tasks.length > 10000) throw Error('任务文件格式或版本不受支持。')
  const ids = new Set()
  return tasks.map(t => {
    if (!t || typeof t.id !== 'string' || !t.id || t.id.length > 128 || ids.has(t.id) ||
      typeof t.title !== 'string' || !t.title.trim() || t.title.length > 120 ||
      typeof t.note !== 'string' || t.note.length > 1000 ||
      ![...categories, '工作', '学习'].includes(t.category) || !['高', '中', '低'].includes(t.priority) ||
      typeof t.done !== 'boolean' || typeof t.reminded !== 'boolean' || typeof t.due !== 'string') {
      throw Error('任务文件包含无效字段或重复编号，未修改现有数据。')
    }
    if (t.due) {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t.due)
      const d = new Date(t.due)
      if (!match || !Number(match[1]) || !Number.isFinite(d.getTime()) ||
        d.getFullYear() !== +match[1] || d.getMonth() + 1 !== +match[2] || d.getDate() !== +match[3] ||
        d.getHours() !== +match[4] || d.getMinutes() !== +match[5]) throw Error('任务文件包含不存在的日期。')
    }
    const timing = {}
    const validTimestamp = timestamp => typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) && Number.isFinite(Date.parse(timestamp)) && new Date(timestamp).toISOString() === timestamp
    for (const field of ['startedAt', 'completedAt']) {
      if (t[field] === undefined) continue
      const timestamp = t[field]
      if (!validTimestamp(timestamp)) throw Error('实际时间格式无效。')
      timing[field] = timestamp
    }
    if (timing.startedAt && timing.completedAt && timing.completedAt < timing.startedAt) throw Error('完成时间不能早于开始时间。')
    if (timing.completedAt && !t.done || t.done && timing.startedAt && !timing.completedAt) throw Error('实际时间与任务完成状态不一致。')
    if (t.pauses !== undefined) {
      if (!Array.isArray(t.pauses) || !timing.startedAt || t.pauses.length > 1000) throw Error('暂停记录无效。')
      let previous = timing.startedAt
      timing.pauses = t.pauses.map((pause, index) => {
        if (!pause || !validTimestamp(pause.startedAt) || pause.startedAt < previous ||
          (pause.endedAt !== undefined && (!validTimestamp(pause.endedAt) || pause.endedAt < pause.startedAt)) ||
          (pause.endedAt === undefined && (index !== t.pauses.length - 1 || t.done)) ||
          (timing.completedAt && (pause.startedAt > timing.completedAt || pause.endedAt && pause.endedAt > timing.completedAt))) throw Error('暂停记录无效。')
        previous = pause.endedAt || pause.startedAt
        return { startedAt: pause.startedAt, ...(pause.endedAt ? { endedAt: pause.endedAt } : {}) }
      })
    }
    let recurrence
    if (t.recurrence !== undefined) {
      const r = t.recurrence
      const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 0 && Number.isFinite(Date.parse(`${value}T12:00:00`)) && localDate(new Date(`${value}T12:00:00`)) === value
      if (!r || !['daily', 'weekly', 'monthly'].includes(r.frequency) || !validDate(r.start) || typeof r.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ||
        (r.minutes !== undefined && (!Number.isInteger(r.minutes) || r.minutes < 1 || r.minutes > 1440)) || !r.records || typeof r.records !== 'object' || Array.isArray(r.records) || Object.keys(r.records).length > 20000 || !t.due) throw Error('周期任务的日期、时间或目标时长无效。')
      const records = {}
      for (const [day, state] of Object.entries(r.records)) {
        if (!validDate(day) || !state || typeof state !== 'object') throw Error('周期任务记录无效。')
        const record = validateTasks([{ ...t, recurrence: undefined, recommendation: undefined, done: state.done, reminded: state.reminded, startedAt: state.startedAt, completedAt: state.completedAt, pauses: state.pauses, due: `${day}T12:00` }])[0]
        records[day] = occurrenceState(record)
      }
      recurrence = { frequency: r.frequency, start: r.start, time: r.time, ...(r.minutes === undefined ? {} : { minutes: r.minutes }), records }
    }
    ids.add(t.id)
    return { id: t.id, title: t.title.trim(), note: t.note, category: t.category === '工作' ? '课外' : t.category === '学习' ? '课内' : t.category, priority: t.priority, due: t.due, done: t.done, reminded: t.reminded, ...timing, ...(recurrence ? { recurrence } : {}), ...(t.recommendation === undefined ? {} : { recommendation: validateRecord(t.recommendation) }) }
  })
}

export function parseTasks(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > maxBytes) throw Error('任务文件不能超过 10 MB。')
  try { return validateTasks(JSON.parse(text)) } catch (error) {
    if (error instanceof SyntaxError) throw Error('这不是有效的 JSON 任务文件。')
    throw error
  }
}

export function serializeTasks(tasks) {
  const text = JSON.stringify({ version: 1, tasks: validateTasks(tasks) }, null, 2)
  if (new TextEncoder().encode(text).length > maxBytes) throw Error('任务数据不能超过 10 MB。')
  return text
}

export function applyCommand(tasks, command, now = Date.now()) {
  const projected = tasks.map(t => t.recurrence && t.id === command?.id ? command.due ? projectOccurrence(t, command.due.slice(0, 10)) : projectTask(t, localDate(new Date(now))) : t)
  const next = executeCommand(projected, command, now)
  if (command.type === 'import' || command.type === 'delete') return next
  const id = command.type === 'upsert' ? command.task.id : command.id
  return validateTasks(next.map(t => t.id === id && t.recurrence ? { ...t, recurrence: { ...t.recurrence, records: { ...t.recurrence.records, [t.due.slice(0, 10)]: occurrenceState(t) } } } : t))
}

function executeCommand(tasks, command, now) {
  if (!command || typeof command !== 'object') throw Error('无效操作。')
  if (command.type === 'import') {
    const imported = parseTasks(command.text)
    const existing = new Set(tasks.map(task => task.id))
    return validateTasks([...tasks, ...imported.filter(task => !existing.has(task.id))])
  }
  if (command.type === 'upsert') {
    const task = validateTasks([command.task])[0]
    const stored = tasks.find(t => t.id === task.id)
    const previous = stored?.recurrence ? projectOccurrence(stored, task.due.slice(0, 10)) : stored
    if (task.recurrence && stored?.recurrence) task.recurrence.records = stored.recurrence.records
    if (previous?.recommendation) {
      const old = previous.recommendation
      const r = task.recommendation || old
      task.recommendation = { ...old, goal: r.goal, minutes: r.minutes, trackProgress: r.trackProgress }
      if (old.goal !== r.goal) { task.done = false; delete task.startedAt; delete task.completedAt; delete task.pauses }
      if (previous.title !== task.title || previous.note !== task.note || old.goal !== r.goal || old.minutes !== r.minutes) {
        // A free-text rewrite cannot be assumed to describe the same measurable activity.
        if (previous.title !== task.title && old.goal === r.goal) task.recommendation.trackProgress = false
        task.recommendation.changes = [...old.changes, { title: task.title, note: task.note, goal: r.goal, minutes: r.minutes, at: new Date().toISOString() }].slice(-20)
      }
      task.recommendation.completedDate = task.done ? (task.completedAt ? localDate(new Date(task.completedAt)) : old.completedDate || localDate(new Date(now))) : ''
    }
    task.reminded = previous?.due === task.due ? previous.reminded : false
    return validateTasks(previous ? tasks.map(t => t.id === task.id ? task : t) : [...tasks, task])
  }
  if (command.type === 'delete') return tasks.filter(t => t.id !== command.id)
  if (['start', 'pause', 'resume', 'complete', 'toggle'].includes(command.type)) return validateTasks(tasks.map(t => {
    if (t.id !== command.id) return t
    if (command.type === 'start') return t.done || t.startedAt ? t : { ...t, startedAt: new Date(now).toISOString() }
    if (command.type === 'pause') return t.done || !t.startedAt || t.pauses?.at(-1)?.endedAt === undefined && t.pauses?.length ? t : { ...t, pauses: [...(t.pauses || []), { startedAt: new Date(now).toISOString() }] }
    if (command.type === 'resume') return t.done || !t.pauses?.length || t.pauses.at(-1).endedAt ? t : { ...t, pauses: [...t.pauses.slice(0, -1), { ...t.pauses.at(-1), endedAt: new Date(now).toISOString() }] }
    if (t.done) {
      if (command.type === 'complete') return t
      const { startedAt: _startedAt, completedAt: _completedAt, pauses: _pauses, ...rest } = t
      return { ...rest, done: false, ...(t.recommendation ? { recommendation: { ...t.recommendation, completedDate: '' } } : {}) }
    }
    const pauses = t.pauses?.at(-1) && !t.pauses.at(-1).endedAt ? [...t.pauses.slice(0, -1), { ...t.pauses.at(-1), endedAt: new Date(now).toISOString() }] : t.pauses
    return { ...t, done: true, completedAt: new Date(now).toISOString(), ...(pauses ? { pauses } : {}), ...(t.recommendation ? { recommendation: { ...t.recommendation, completedDate: localDate(new Date(now)) } } : {}) }
  }))
  throw Error('不支持的操作。')
}

export function dueTasks(tasks, now = Date.now()) {
  return tasks.map(t => projectTask(t, localDate(new Date(now)))).filter(t => !t.done && !t.reminded && t.due && new Date(t.due).getTime() <= now)
}

export function markReminded(tasks, due) {
  const byId = new Map(due.map(t => [t.id, t]))
  return tasks.map(t => {
    const occurrence = byId.get(t.id)
    if (!occurrence) return t
    if (!t.recurrence) return { ...t, reminded: true }
    return { ...t, recurrence: { ...t.recurrence, records: { ...t.recurrence.records, [occurrence.due.slice(0, 10)]: { ...occurrenceState(occurrence), reminded: true } } } }
  })
}
