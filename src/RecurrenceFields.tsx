import type { Task, Recurrence } from '../shared/tasks.mjs'
import { dateKey } from './taskRepository'

export function RecurrenceFields({ task, onChange }: { task: Task; onChange: (task: Task) => void }) {
  const rule = task.recurrence
  const update = (changes: Partial<Recurrence>) => {
    if (!rule) return
    const recurrence = { ...rule, ...changes }
    onChange({ ...task, recurrence, due: `${changes.start || task.due.slice(0, 10) || recurrence.start}T${recurrence.time}` })
  }
  return <div className="recurrence-fields">
    <label>重复周期<select value={rule?.frequency || 'none'} onChange={event => {
      const frequency = event.target.value
      if (frequency === 'none') { onChange({ ...task, recurrence: undefined }); return }
      const start = task.due.slice(0, 10) || dateKey(new Date())
      const time = task.due.slice(11, 16) || '18:00'
      onChange({ ...task, due: `${start}T${time}`, recurrence: { start, time, records: {}, ...rule, frequency: frequency as Recurrence['frequency'] } })
    }}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label>
    {rule && <>
      <div className="form-columns"><label>开始日期<input type="date" required min="0001-01-01" max="9999-12-31" value={rule.start} onChange={event => update({ start: event.target.value })}/></label><label>每次提醒时间<input type="time" required value={rule.time} onChange={event => update({ time: event.target.value })}/></label></div>
      <label>每次目标时长（分钟，选填）<input type="number" min="1" max="1440" step="1" placeholder="例如：30" value={rule.minutes ?? ''} onChange={event => update({ minutes: event.target.value ? Number(event.target.value) : undefined })}/></label>
      <p className="form-help">只保留一条任务，每个周期独立完成，下个周期自动恢复待办。{rule.frequency === 'weekly' ? '每周在开始日期对应的星期执行。' : rule.frequency === 'monthly' ? '每月在开始日期对应的日期执行，遇到短月则在月末执行。' : ''}错过的周期不补发提醒，执行记录仍会保留。修改周期设置会应用于后续安排。</p>
    </>}
  </div>
}
