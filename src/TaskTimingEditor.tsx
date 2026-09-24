import { useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Pause, Task } from '../shared/tasks.mjs'
import { localTime } from './taskTime'

export type TaskTimingHandle = { commit: () => Pick<Task, 'startedAt' | 'completedAt' | 'pauses' | 'done'> | null }
type Segment = { id: number; start: string; end: string; originalStart?: string; originalEnd?: string }

function initialSegments(task: Task): Segment[] {
  if (!task.startedAt) return [{ id: 0, start: '', end: localTime(task.completedAt), originalEnd: task.completedAt }]
  const segments: Segment[] = []
  let start = task.startedAt
  for (const pause of task.pauses || []) {
    segments.push({ id: segments.length, start: localTime(start), end: localTime(pause.startedAt), originalStart: start, originalEnd: pause.startedAt })
    if (!pause.endedAt) return segments
    start = pause.endedAt
  }
  segments.push({ id: segments.length, start: localTime(start), end: localTime(task.completedAt), originalStart: start, originalEnd: task.completedAt })
  return segments
}

export function TaskTimingEditor({ task, ref }: { task: Task; ref: Ref<TaskTimingHandle> }) {
  const [segments, setSegments] = useState<Segment[]>(() => initialSegments(task))
  const [paused, setPaused] = useState(Boolean(task.pauses?.length && !task.pauses.at(-1)?.endedAt))
  const [error, setError] = useState('')
  const nextId = useRef(segments.length)
  const update = (id: number, field: 'start' | 'end', value: string) =>
    setSegments(rows => rows.map(row => row.id === id ? { ...row, [field]: value } : row))

  useImperativeHandle(ref, () => ({ commit() {
    const parse = (value: string, original?: string) => {
      if (!value) return undefined
      if ((value.length === 16 ? `${value}:00` : value) === localTime(original)) return original
      const date = new Date(value)
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) throw Error('实际时间不能在未来。')
      return date.toISOString()
    }
    try {
      const intervals = segments.map(row => ({ start: parse(row.start, row.originalStart), end: parse(row.end, row.originalEnd) }))
      const first = intervals[0]
      const last = intervals.at(-1)!
      if (intervals.length > 1 && intervals.some(row => !row.start)) throw Error('每段执行都需要填写开始时间。')
      if (first.end && !first.start && intervals.length > 1) throw Error('请填写第一段的开始时间。')
      const pauses: Pause[] = []
      for (let index = 0; index < intervals.length; index++) {
        const row = intervals[index]
        if (row.start && row.end && row.end < row.start) throw Error(index === 0 ? '完成时间不能早于开始时间。' : `第 ${index + 1} 段结束时间不能早于开始时间。`)
        if (index === intervals.length - 1) continue
        if (!row.end) throw Error(`请填写第 ${index + 1} 段的结束时间。`)
        const next = intervals[index + 1]
        if (next.start! < row.end) throw Error('相邻执行时段不能重叠。')
        pauses.push({ startedAt: row.end, endedAt: next.start! })
      }
      if (paused && !last.end) throw Error('暂停中需要填写最后一段的结束时间。')
      if (paused && !first.start) throw Error('请填写第一段的开始时间。')
      if (paused) pauses.push({ startedAt: last.end! })
      const startedAt = first.start
      const completedAt = paused ? undefined : last.end
      // Legacy completed tasks retain their status until actual times are supplied.
      const done = Boolean(completedAt || task.done && !task.completedAt && !startedAt)
      setError('')
      return { startedAt, completedAt, pauses: pauses.length ? pauses : undefined, done }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请检查实际时间。')
      return null
    }
  } }))

  return <details className="timing-editor" open={Boolean(task.startedAt || task.completedAt) || undefined}>
    <summary>实际执行时间 · 补录 / 修改</summary>
    <p>按本机时间填写，可跨天。默认只需填写一段；添加下一段后，两段之间的空档不会计入用时。</p>
    {segments.map((segment, index) => <div className="pause-editor-row" key={segment.id}>
      {segments.length > 1 && <div className="pause-editor-row-heading"><strong>第 {index + 1} 段执行</strong><button type="button" onClick={() => setSegments(rows => rows.filter(row => row.id !== segment.id))}>删除此段</button></div>}
      <div className="form-columns"><label>开始时间<input type="datetime-local" step="1" value={segment.start} onChange={event => update(segment.id, 'start', event.target.value)} /></label><label>结束时间<input type="datetime-local" step="1" value={segment.end} onChange={event => update(segment.id, 'end', event.target.value)} /></label></div>
      {index === segments.length - 1 && (segment.end || paused) && <label className="paused-toggle"><input type="checkbox" checked={paused} onChange={event => setPaused(event.target.checked)} />结束后仍在暂停，任务尚未完成</label>}
    </div>)}
    <button type="button" className="confirm-time add-pause-segment" onClick={() => { setPaused(false); setSegments(rows => [...rows, { id: nextId.current++, start: '', end: '' }]) }}>添加暂停时段</button>
    <p>最后一段不填结束时间表示仍在执行；填写后会标记任务完成。取消完成任务会清空本次时间记录。</p>
    {error && <div role="alert" className="time-error">{error}</div>}
  </details>
}
