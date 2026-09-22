import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import type { Task } from './taskRepository'
import type { Recommendation } from './recommendations'
import { goalTitle, seriesSpecs, validGoal } from '../shared/recommendation-record.mjs'

export function RecommendationPicker({ item, date, onConfirm, onClose }: { item: Recommendation; date: string; onConfirm(task: Task): Promise<boolean>; onClose(): void }) {
  const initialNote = `${item.note}${item.source ? `\n参考资料：${item.source.title}\n${item.source.url}` : ''}`
  const [title, setTitle] = useState(item.title)
  const [note, setNote] = useState(initialNote)
  const [goal, setGoal] = useState(String(item.goal ?? ''))
  const [minutes, setMinutes] = useState(String(item.minutes))
  const [due, setDue] = useState(`${date}T23:59`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  const tracked = Boolean(item.series && validGoal(item.series, Number(goal)) && title === goalTitle(item.series, Number(goal)))
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving.current) return
    if (!title.trim() || !Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 240 || (item.series && !validGoal(item.series, Number(goal)))) { setError('请填写有效的标题、用时和目标量。'); return }
    saving.current = true; setBusy(true); setError('')
    const chosenGoal = item.series ? Number(goal) : null
    const task: Task = {
      id: item.id, title: title.trim(), note, category: item.category, priority: '低', due, done: false, reminded: false,
      recommendation: { candidateId: item.id, date, acceptedAt: new Date().toISOString(), area: item.area, series: item.series || '', trackProgress: tracked, goal: chosenGoal, minutes: Number(minutes),
        original: { title: item.title, note: initialNote, minutes: item.minutes, goal: item.goal ?? null },
        accepted: { title: title.trim(), note, minutes: Number(minutes), goal: chosenGoal }, changes: [], completedDate: '' },
    }
    try { if (await onConfirm(task)) onClose(); else setError('保存失败，尚未加入计划，也没有记录为已接受。请重试。') }
    catch { setError('保存失败，请重试。') }
    finally { saving.current = false; setBusy(false) }
  }
  const close = () => { if (!saving.current) onClose() }
  return createPortal(<dialog ref={dialog} className="task-dialog candidate-dialog" aria-labelledby="candidate-heading" onCancel={e => { e.preventDefault(); close() }} onClick={e => { if (e.target === e.currentTarget) close() }}>
    <form onSubmit={submit}><div className="dialog-heading"><h2 id="candidate-heading">按自己的节奏安排</h2><button type="button" className="icon-button" aria-label="关闭候选任务" disabled={busy} onClick={close}>×</button></div>
      <p className="candidate-original">原推荐：{item.title} · 约 {item.minutes} 分钟</p>
      <label>任务标题<input aria-label="候选任务标题" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required disabled={busy}/></label>
      {item.series && <label>目标量（{seriesSpecs[item.series].unit}）<input aria-label="目标量" type="number" value={goal} min={item.series === 'run' ? 0.1 : 1} max={seriesSpecs[item.series].max} step={item.series === 'run' ? 0.1 : 1} disabled={busy} required onChange={e => { setGoal(e.target.value); if (validGoal(item.series, Number(e.target.value))) { setTitle(goalTitle(item.series!, Number(e.target.value))); if (item.series === 'read') setMinutes(e.target.value) } }}/></label>}
      <div className="form-columns"><label>预计用时（分钟）<input aria-label="候选预计用时" type="number" min={1} max={240} step={1} required value={minutes} onChange={e => setMinutes(e.target.value)} disabled={busy}/></label><label>提醒时间<input aria-label="候选提醒时间" type="datetime-local" value={due} onChange={e => setDue(e.target.value)} disabled={busy}/></label></div>
      <label>任务备注<textarea aria-label="候选任务备注" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} disabled={busy}/></label>
      <p className="preference-help">只选自己想做的即可。原推荐与实际接受的版本都会记录在本机，后续推荐参考你的选择和完成情况。{item.series && !tracked && ' 标题已自定义，这条记录不会用于自动增加数值目标。'}</p>
      {error && <p role="alert" className="time-error">{error}</p>}
      <div className="dialog-footer"><button type="button" className="secondary-button" onClick={close} disabled={busy}>再想想</button><button type="submit" className="primary-button" disabled={busy}>{busy ? '正在保存…' : '确认加入计划'}</button></div>
    </form>
  </dialog>, document.body)
}
