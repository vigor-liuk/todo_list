import type { Task, Recurrence } from '../shared/tasks.mjs'
import { recurrenceDays } from '../shared/recurrence.mjs'
import { dateKey } from './taskRepository'

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const monthDays = Array.from({ length: 31 }, (_, index) => index + 1)

export function RecurrenceFields({ task, onChange }: { task: Task; onChange: (task: Task) => void }) {
  const rule = task.recurrence
  const update = (changes: Partial<Recurrence>) => {
    if (!rule) return
    const recurrence = { ...rule, ...changes }
    onChange({ ...task, recurrence, due: task.due ? `${task.due.slice(0, 10)}T${recurrence.time}` : '' })
  }
  const weekly = rule?.frequency === 'weekly'
  const selected = rule ? recurrenceDays(rule) : []
  return <div className="recurrence-fields">
    <label>重复周期<select value={rule?.frequency || 'none'} onChange={event => {
      const frequency = event.target.value as Recurrence['frequency'] | 'none'
      if (frequency === 'none') { onChange({ ...task, recurrence: undefined }); return }
      if (rule) { update({ frequency, days: undefined }); return }
      const start = task.due.slice(0, 10) || dateKey(new Date())
      const time = task.due.slice(11, 16) || '18:00'
      onChange({ ...task, due: `${start}T${time}`, recurrence: { start, time, records: {}, frequency } })
    }}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label>
    {rule && <>
      <div className="form-columns">
        <label>开始日期<input type="date" required min="0001-01-01" max="9999-12-31" value={rule.start} onChange={event => update({ start: event.target.value })}/></label>
        <label>结束日期（选填）<input type="date" min={rule.start || '0001-01-01'} max="9999-12-31" value={rule.end ?? ''} onChange={event => update({ end: event.target.value || undefined })}/></label>
      </div>
      {rule.frequency !== 'daily' && <fieldset className="recurrence-options">
        <legend>{weekly ? '每周重复日' : '每月重复日'}（可多选）</legend>
        <div className="recurrence-days">
          {(weekly ? [1, 2, 3, 4, 5, 6, 0] : monthDays).map(day => <label key={day}>
            <input type="checkbox" checked={selected.includes(day)} onChange={event => update({
              days: event.target.checked ? [...selected, day] : selected.filter(value => value !== day),
            })}/>{weekly ? weekdays[(day + 6) % 7] : `${day} 日`}
          </label>)}
        </div>
        {!selected.length && <p className="time-error" role="alert">请至少选择一天。</p>}
        {!weekly && <p className="recurrence-hint">{rule.days ? '当月没有选中的某一天时，会跳过该日。' : '默认按开始日期的日号重复，短月沿用月末安排。手动选择日号后，短月会跳过不存在的日期。'}</p>}
      </fieldset>}
      <div className="form-columns">
        <label>每次提醒时间<input type="time" required value={rule.time} onChange={event => update({ time: event.target.value })}/></label>
        <label>每次目标时长（分钟，选填）<input type="number" min="1" max="1440" step="1" placeholder="例如：30" value={rule.minutes ?? ''} onChange={event => update({ minutes: event.target.value ? Number(event.target.value) : undefined })}/></label>
      </div>
      <p className="form-help">每次执行独立记录。结束日期包含当天，之后自动停止排期和提醒，已记录的数据仍可在时间回顾查看。</p>
    </>}
  </div>
}
