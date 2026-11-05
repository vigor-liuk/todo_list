const dateKey = date => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const weekdays = '日一二三四五六'

export function recurrenceDays(rule) {
  const anchor = new Date(`${rule.start}T12:00:00`)
  return rule.days ?? [rule.frequency === 'weekly' ? anchor.getDay() : anchor.getDate()]
}

// Choose one occurrence on or after the requested local date.
export function occurrenceDate(rule, day) {
  const first = day < rule.start ? rule.start : day
  if (rule.end && first > rule.end) return undefined
  const date = new Date(`${first}T12:00:00`)
  if (rule.frequency === 'weekly') {
    const offset = Math.min(...recurrenceDays(rule).map(weekday => (weekday - date.getDay() + 7) % 7))
    date.setDate(date.getDate() + offset)
  }
  if (rule.frequency === 'monthly') {
    const days = recurrenceDays(rule)
    while (date.getFullYear() <= 9999) {
      const monthEnd = new Date(date)
      monthEnd.setMonth(monthEnd.getMonth() + 1, 0)
      const last = monthEnd.getDate()
      const candidates = rule.days ? days.filter(value => value <= last) : [Math.min(days[0], last)]
      const match = Math.min(...candidates.filter(value => value >= date.getDate()))
      if (Number.isFinite(match)) { date.setDate(match); break }
      date.setMonth(date.getMonth() + 1, 1)
    }
  }
  const result = dateKey(date)
  return date.getFullYear() <= 9999 && (!rule.end || result <= rule.end) ? result : undefined
}

export function occurrenceState(task) {
  return { done: task.done, reminded: task.reminded, ...(task.startedAt ? { startedAt: task.startedAt } : {}), ...(task.completedAt ? { completedAt: task.completedAt } : {}), ...(task.pauses?.length ? { pauses: task.pauses } : {}) }
}

export function hasOccurrenceRecord(state) {
  return Boolean(state && (state.done || state.reminded || state.startedAt))
}

export function projectTask(task, day = dateKey(new Date()), includeRunning = true) {
  const rule = task.recurrence
  if (!rule) return task
  const running = includeRunning && Object.keys(rule.records).filter(date => date <= day && rule.records[date].startedAt && !rule.records[date].done).sort()[0]
  const hasRecord = !includeRunning && hasOccurrenceRecord(rule.records[day])
  const date = running || (hasRecord ? day : occurrenceDate(rule, day))
  return projectOccurrence(task, date)
}

export function projectOccurrence(task, date) {
  if (!task.recurrence) return task
  const state = date && task.recurrence.records[date] || { done: false, reminded: false }
  return { ...task, startedAt: undefined, completedAt: undefined, pauses: undefined, ...state, due: date ? `${date}T${task.recurrence.time}` : '' }
}

export function reviewOccurrences(tasks, day) {
  return tasks.flatMap(task => {
    const history = (task.recurrenceHistory || []).flatMap(({ time, records, archivedAt }, group) =>
      Object.entries(records).map(([date, state]) => ({
        ...task, startedAt: undefined, completedAt: undefined, pauses: undefined, ...state,
        recurrence: undefined, due: `${date}T${time}`, historyKey: group, archivedAt,
      })))
    if (!task.recurrence) return [task, ...history]
    const dates = new Set(Object.keys(task.recurrence.records).filter(date => hasOccurrenceRecord(task.recurrence.records[date])))
    if (occurrenceDate(task.recurrence, day) === day) dates.add(day)
    return [...Array.from(dates, date => projectOccurrence(task, date)), ...history]
  })
}

export function recurrenceLabel(task) {
  const r = task.recurrence
  if (!r) return ''
  const days = recurrenceDays(r)
  const frequency = r.frequency === 'daily' ? '每天' : r.frequency === 'weekly' ? `每周${days.map(day => weekdays[day]).join('、')}` : `每月 ${days.join('、')} 日`
  return `${frequency} ${r.time}${r.minutes ? ` · 目标 ${r.minutes} 分钟` : ''}${r.end ? ` · 截至 ${r.end}` : ''}`
}
