import type { Task } from './taskRepository'
import { goalTitle, seriesSpecs } from '../shared/recommendation-record.mjs'

export function RecommendationTaskFields({ task, onChange }: { task: Task; onChange(task: Task): void }) {
  const r = task.recommendation
  if (!r) return null
  return <div className="form-columns">
    {r.series && <label>推荐目标（{seriesSpecs[r.series].unit}）<input aria-label="编辑推荐目标" type="number" required value={r.goal ?? ''} min={r.series === 'run' ? 0.1 : 1} max={seriesSpecs[r.series].max} step={r.series === 'run' ? 0.1 : 1} onChange={e => onChange({ ...task, title: goalTitle(r.series as keyof typeof seriesSpecs, Number(e.target.value)), recommendation: { ...r, goal: Number(e.target.value), trackProgress: true } })}/></label>}
    <label>预计用时（分钟）<input aria-label="编辑推荐用时" type="number" min={1} max={240} step={1} required value={r.minutes} onChange={e => onChange({ ...task, recommendation: { ...r, minutes: Number(e.target.value) } })}/></label>
  </div>
}
