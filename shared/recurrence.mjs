const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// Choose one occurrence on or after the requested local date; never create task copies.
export function occurrenceDate(rule, day) {
  if (day <= rule.start) return rule.start
  const date = new Date(`${day}T12:00:00`)
  const anchor = new Date(`${rule.start}T12:00:00`)
  if (rule.frequency === 'weekly') date.setDate(date.getDate() + (anchor.getDay() - date.getDay() + 7) % 7)
  if (rule.frequency === 'monthly') {
    const wanted = anchor.getDate()
    const setDay = () => date.setDate(Math.min(wanted, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()))
    setDay()
    if (dateKey(date) < day) { date.setDate(1); date.setMonth(date.getMonth() + 1); setDay() }
  }
  return dateKey(date)
}

export function occurrenceState(task) {
  return { done: task.done, reminded: task.reminded, ...(task.startedAt ? { startedAt: task.startedAt } : {}), ...(task.completedAt ? { completedAt: task.completedAt } : {}) }
}

export function projectTask(task, day = dateKey(new Date())) {
  if (!task.recurrence) return task
  const running = Object.keys(task.recurrence.records).filter(date => date <= day && task.recurrence.records[date].startedAt && !task.recurrence.records[date].done).sort()[0]
  const date = running || (task.recurrence.records[day] ? day : occurrenceDate(task.recurrence, day))
  return projectOccurrence(task, date)
}

export function projectOccurrence(task, date) {
  if (!task.recurrence) return task
  const state = task.recurrence.records[date] || { done: false, reminded: false }
  return { ...task, startedAt: undefined, completedAt: undefined, ...state, due: `${date}T${task.recurrence.time}` }
}

export function reviewOccurrences(tasks, day) {
  return tasks.flatMap(task => {
    if (!task.recurrence) return [task]
    const dates = new Set([...Object.keys(task.recurrence.records), occurrenceDate(task.recurrence, day)])
    return [...dates].map(date => projectOccurrence(task, date))
  })
}

export function recurrenceLabel(task) {
  const r = task.recurrence
  if (!r) return ''
  const anchor = new Date(`${r.start}T12:00:00`)
  const frequency = r.frequency === 'daily' ? '每天' : r.frequency === 'weekly' ? `每周${'日一二三四五六'[anchor.getDay()]}` : `每月 ${anchor.getDate()} 日`
  return `${frequency} ${r.time}${r.minutes ? ` · 目标 ${r.minutes} 分钟` : ''}`
}
