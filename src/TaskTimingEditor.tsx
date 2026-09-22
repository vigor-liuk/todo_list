import { useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Task } from './taskRepository'
import { localTime } from './taskTime'

export type TaskTimingHandle = { commit: () => Pick<Task, 'startedAt' | 'completedAt' | 'done'> | null }

export function TaskTimingEditor({ task, ref }: { task: Task; ref: Ref<TaskTimingHandle> }) {
  const start = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  useImperativeHandle(ref, () => ({ commit() {
    const parse = (input: HTMLInputElement | null, original?: string) => {
      const value = input?.value
      if (!value) return undefined
      if ((value.length === 16 ? `${value}:00` : value) === localTime(original)) return original
      const date = new Date(value)
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) throw Error('实际时间不能在未来。')
      return date.toISOString()
    }
    try {
      const startedAt = parse(start.current, task.startedAt)
      const completedAt = parse(end.current, task.completedAt)
      if (startedAt && completedAt && startedAt > completedAt) throw Error('完成时间不能早于开始时间。')
      // Legacy completed tasks retain their status until actual times are supplied.
      const done = Boolean(completedAt || task.done && !task.completedAt && !startedAt)
      setError('')
      return { startedAt, completedAt, done }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请检查实际时间。')
      return null
    }
  } }))
  return <details className="timing-editor" open={Boolean(task.startedAt || task.completedAt) || undefined}>
    <summary>实际执行时间 · 补录 / 修改</summary>
    <p>按本机时间填写，可跨天。填写完成时间会标记任务完成；只填开始时间表示进行中。</p>
    <label>实际开始时间<input ref={start} type="datetime-local" step="1" defaultValue={localTime(task.startedAt)} /></label>
    <label>实际完成时间<input ref={end} type="datetime-local" step="1" defaultValue={localTime(task.completedAt)} /></label>
    <p>清空已记录的完成时间会恢复为未完成。取消完成任务会清空这次起止时间。</p>
    {error && <div role="alert" className="time-error">{error}</div>}
  </details>
}
