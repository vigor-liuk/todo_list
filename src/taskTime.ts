import type { Task } from './taskRepository'
import { dateKey } from './taskRepository'

export function localTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

export function timeLabel(value: string, day: string) {
  const local = localTime(value)
  return `${local.slice(0, 10) === day ? '' : `${local.slice(0, 10)} `}${local.slice(11, 16)}`
}

export function durationLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`
}

export function timingLabel(task: Task, now: number, day: string) {
  if (task.startedAt) {
    const end = task.completedAt ? Date.parse(task.completedAt) : now
    return `${timeLabel(task.startedAt, day)} — ${task.completedAt ? timeLabel(task.completedAt, day) : '进行中'} · ${durationLabel(end - Date.parse(task.startedAt))}`
  }
  return task.completedAt ? `${timeLabel(task.completedAt, day)} 完成 · 未记录开始时间` : ''
}

export function dayRecords(tasks: Task[], day: string, now: number) {
  const start = new Date(`${day}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const from = start.getTime(), to = end.getTime()
  return tasks.filter(task => {
    const completed = task.completedAt ? Date.parse(task.completedAt) : undefined
    const started = task.startedAt ? Date.parse(task.startedAt) : undefined
    return completed !== undefined && completed >= from && completed < to ||
      started !== undefined && started < to && (completed ?? now) >= from
  }).map(task => ({ task, duration: task.startedAt ? Math.max(0, Math.min(task.completedAt ? Date.parse(task.completedAt) : now, to) - Math.max(Date.parse(task.startedAt), from)) : 0 }))
    .sort((a, b) => Date.parse(a.task.startedAt || a.task.completedAt!) - Date.parse(b.task.startedAt || b.task.completedAt!))
}
