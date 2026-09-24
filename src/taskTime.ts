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

export function workIntervals(task: Task, now: number): { start: number; end: number }[] {
  if (!task.startedAt) return []
  const finish = task.completedAt ? Date.parse(task.completedAt) : now
  let cursor = Date.parse(task.startedAt)
  const intervals: { start: number; end: number }[] = []
  for (const pause of task.pauses || []) {
    const paused = Math.min(Date.parse(pause.startedAt), finish)
    if (paused > cursor) intervals.push({ start: cursor, end: paused })
    cursor = pause.endedAt ? Date.parse(pause.endedAt) : finish
  }
  if (finish > cursor) intervals.push({ start: cursor, end: finish })
  return intervals
}

export function workDuration(task: Task, now: number, from = -Infinity, to = Infinity) {
  return workIntervals(task, now).reduce((total, interval) => total + Math.max(0, Math.min(interval.end, to) - Math.max(interval.start, from)), 0)
}

export function timingLabel(task: Task, now: number, day: string) {
  if (task.startedAt) {
    const paused = !task.done && task.pauses?.length && !task.pauses.at(-1)?.endedAt
    return `${timeLabel(task.startedAt, day)} — ${task.completedAt ? timeLabel(task.completedAt, day) : paused ? '已暂停' : '进行中'} · ${durationLabel(workDuration(task, now))}`
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
  }).map(task => ({ task, duration: workDuration(task, now, from, to) }))
    .sort((a, b) => Date.parse(a.task.startedAt || a.task.completedAt!) - Date.parse(b.task.startedAt || b.task.completedAt!))
}
