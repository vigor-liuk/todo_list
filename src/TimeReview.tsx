import { useState } from 'react'
import type { Task } from './taskRepository'
import { dateKey } from './taskRepository'
import { dayRecords, durationLabel, timingLabel } from './taskTime'

type Props = { tasks: Task[]; day: string; today: string; now: number; onDay: (day: string) => void; onEdit: (task: Task) => void; onComplete: (task: Task) => void }
const hours = Array.from({ length: 25 }, (_, hour) => hour)
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

export function TimeReview({ tasks, day, today, now, onDay, onEdit, onComplete }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const records = dayRecords(tasks, day, now)
  const completed = records.filter(({ task }) => task.completedAt && dateKey(new Date(task.completedAt)) === day).length
  const recordedIds = new Set(records.map(({ task }) => task.id))
  const planned = tasks.filter(task => task.due.startsWith(day) && !recordedIds.has(task.id))
  const rows = [...records, ...planned.map(task => ({ task, duration: 0 }))]
    .sort((a, b) => Date.parse(a.task.startedAt || a.task.completedAt || a.task.due) - Date.parse(b.task.startedAt || b.task.completedAt || b.task.due))
  const selected = rows.find(({ task }) => task.id === selectedId)
  const start = new Date(`${day}T00:00:00`).getTime()
  const nextDay = new Date(start)
  nextDay.setDate(nextDay.getDate() + 1)
  const end = nextDay.getTime()
  // Local wall-clock positions keep bars aligned with the displayed hour labels.
  const position = (timestamp: number) => {
    if (timestamp <= start) return 0
    if (timestamp >= end) return 100
    const date = new Date(timestamp)
    return (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) / 864
  }
  const shift = (offset: number) => {
    const date = new Date(`${day}T12:00:00`)
    date.setDate(date.getDate() + offset)
    onDay(dateKey(date))
  }
  const status = (task: Task) => task.done ? '已完成' : task.startedAt ? '进行中' : '未开始'
  return <section className="time-review" aria-label="每日时间回顾">
    <div className="review-heading"><div><h2>这一天，时间花在哪里</h2><p>从零点到午夜，看清每件事的安排与实际用时。</p></div>
      <div className="review-date"><button title="回顾前一天" aria-label="回顾前一天" onClick={() => shift(-1)}>‹</button><input type="date" aria-label="回顾日期" value={day} onChange={event => { if (event.target.value) onDay(event.target.value) }}/><button title="回顾后一天" aria-label="回顾后一天" onClick={() => shift(1)}>›</button><button onClick={() => onDay(today)}>今天</button></div>
    </div>
    <div className="review-summary"><span>当日完成 <strong>{completed}</strong> 件</span><span>记录用时 <strong>{durationLabel(records.reduce((total, item) => total + item.duration, 0))}</strong></span><span>当日提醒 <strong>{tasks.filter(task => task.due.startsWith(day)).length}</strong> 件</span></div>
    <div className="chart-legend" aria-label="图例"><span><i className="legend-completed"/>已完成时段</span><span><i className="legend-running"/>进行中时段</span><span><i className="legend-planned"/>原定提醒</span><span><i className="legend-point"/>仅完成时刻</span></div>
    <p className="review-hint" id="timeline-help">横条长度表示当天用时；每行一项任务，重叠时段可上下对照。点击任务或图形查看详情，窄屏可左右滑动。</p>
    <div className="day-chart-scroll" role="region" aria-label="全天任务时间轴" aria-describedby="timeline-help" tabIndex={0}>
      <div className="day-chart">
        <div className="chart-header"><div className="chart-label">任务 / 状态</div><div className="hour-axis">{hours.map(hour => <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{hourLabel(hour)}</span>)}</div></div>
        <div className="chart-body">
          {rows.map(({ task, duration }) => {
            const hasRecord = recordedIds.has(task.id)
            const from = hasRecord ? position(Date.parse(task.startedAt || task.completedAt!)) : 0
            const to = hasRecord ? position(task.completedAt ? Date.parse(task.completedAt) : now) : 0
            const point = !task.startedAt || duration === 0
            const description = `${task.title} · ${status(task)}${hasRecord ? ` · ${timingLabel(task, now, day)} · 当天用时：${durationLabel(duration)}` : ' · 未记录执行时间'}`
            return <div className={`chart-row ${selectedId === task.id ? 'is-selected' : ''}`} key={task.id}>
              <button className="chart-label chart-task" title={`${description}；点击查看详情`} aria-label={`查看记录：${task.title}`} aria-pressed={selectedId === task.id} onClick={() => setSelectedId(task.id)}><strong>{task.title}</strong><span className={task.startedAt && !task.done ? 'status-running' : ''}>{status(task)} · {hasRecord && task.startedAt ? durationLabel(duration) : hasRecord ? '仅完成时刻' : '无执行记录'}</span></button>
              <div className="chart-track">
                {hasRecord && <button className={`execution-bar ${task.done ? 'bar-completed' : 'bar-running'} ${point ? 'completion-point' : ''}`} style={{ left: `${from}%`, width: point ? undefined : `${Math.max(0, to - from)}%` }} title={`${description}；点击查看详情`} aria-label={description} onClick={() => setSelectedId(task.id)}>{!point && <span>{durationLabel(duration)}</span>}</button>}
                {task.due.startsWith(day) && <button className="planned-marker" style={{ left: `${position(Date.parse(task.due))}%` }} title={`${task.title} · 原定提醒 ${task.due.slice(11, 16)}；点击查看详情`} aria-label={`原定提醒：${task.title} ${task.due.slice(11, 16)}`} onClick={() => setSelectedId(task.id)}/>}
              </div>
            </div>
          })}
          {!rows.length && <div className="chart-empty-grid"/>}
          {day === today && <div className="chart-now" style={{ left: `calc(160px + (100% - 160px) * ${position(now) / 100})` }} aria-hidden="true"><span>现在 {new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span></div>}
        </div>
      </div>
    </div>
    {selected && <section className="record-detail" aria-label="任务时间详情">
      <div className="record-detail-heading"><h3>{selected.task.title}</h3><span>{status(selected.task)}</span><button title="关闭任务详情" aria-label="关闭任务详情" onClick={() => setSelectedId(null)}>×</button></div>
      <p className="timeline-time">{timingLabel(selected.task, now, day) || '尚未记录执行时间'}</p>
      {selected.task.note && <p>{selected.task.note}</p>}
      <div className="timeline-meta"><span>{selected.task.category}</span><span>原计划：{selected.task.due ? selected.task.due.replace('T', ' ') : '未设置提醒时间'}</span>{selected.task.startedAt && <span>当天用时：{durationLabel(selected.duration)}</span>}</div>
      <div className="timeline-actions"><button onClick={() => onEdit(selected.task)}>修改记录</button>{!selected.task.done && selected.task.startedAt && <button onClick={() => onComplete(selected.task)}>结束并完成</button>}</div>
    </section>}
    {!records.length && <div className="empty-state"><h3>这一天还没有时间记录</h3><p>{planned.length ? '已在图中标出原定提醒。' : ''}在任务上点击“开始”，完成后就能在这里回顾。<br/>忘记记录时，也可以编辑任务补填实际时间。</p></div>}
    <p className="review-hint review-footnote">跨天任务仅绘制并累计当天用时，同时进行的任务分别累计。原定提醒是时间点，不代表计划时长；未记录起止时间的旧任务不推算用时。</p>
  </section>
}
