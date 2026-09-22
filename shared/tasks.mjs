import { localDate, validateRecord } from './recommendation-record.mjs'
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
    ids.add(t.id)
    return { id: t.id, title: t.title.trim(), note: t.note, category: t.category === '工作' ? '课外' : t.category === '学习' ? '课内' : t.category, priority: t.priority, due: t.due, done: t.done, reminded: t.reminded, ...(t.recommendation === undefined ? {} : { recommendation: validateRecord(t.recommendation) }) }
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

export function applyCommand(tasks, command) {
  if (!command || typeof command !== 'object') throw Error('无效操作。')
  if (command.type === 'import') {
    const imported = parseTasks(command.text)
    const existing = new Set(tasks.map(task => task.id))
    return validateTasks([...tasks, ...imported.filter(task => !existing.has(task.id))])
  }
  if (command.type === 'upsert') {
    const task = validateTasks([command.task])[0]
    const previous = tasks.find(t => t.id === task.id)
    if (previous?.recommendation) {
      const old = previous.recommendation
      const r = task.recommendation || old
      task.recommendation = { ...old, goal: r.goal, minutes: r.minutes, trackProgress: r.trackProgress }
      if (old.goal !== r.goal) task.done = false
      if (previous.title !== task.title || previous.note !== task.note || old.goal !== r.goal || old.minutes !== r.minutes) {
        // A free-text rewrite cannot be assumed to describe the same measurable activity.
        if (previous.title !== task.title && old.goal === r.goal) task.recommendation.trackProgress = false
        task.recommendation.changes = [...old.changes, { title: task.title, note: task.note, goal: r.goal, minutes: r.minutes, at: new Date().toISOString() }].slice(-20)
      }
      task.recommendation.completedDate = task.done ? (old.completedDate || localDate()) : ''
    }
    task.reminded = previous?.due === task.due ? previous.reminded : false
    return validateTasks(previous ? tasks.map(t => t.id === task.id ? task : t) : [...tasks, task])
  }
  if (command.type === 'delete') return tasks.filter(t => t.id !== command.id)
  if (command.type === 'toggle') return tasks.map(t => t.id === command.id ? { ...t, done: !t.done, ...(t.recommendation ? { recommendation: { ...t.recommendation, completedDate: !t.done ? localDate() : '' } } : {}) } : t)
  throw Error('不支持的操作。')
}

export function dueTasks(tasks, now = Date.now()) {
  return tasks.filter(t => !t.done && !t.reminded && t.due && new Date(t.due).getTime() <= now)
}

export function markReminded(tasks, due) {
  const ids = new Set(due.map(t => t.id))
  return tasks.map(t => ids.has(t.id) ? { ...t, reminded: true } : t)
}
