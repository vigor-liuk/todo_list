export const seriesSpecs = {
  run: { area: '运动休息', unit: '公里', initial: 1, step: 0.2, limit: 10, max: 50, label: '轻松跑步' },
  read: { area: '学习成长', unit: '分钟', initial: 10, step: 5, limit: 60, max: 240, label: '专注阅读' },
  tidy: { area: '生活整理', unit: '件物品', initial: 3, step: 1, limit: 20, max: 100, label: '整理' },
  create: { area: '兴趣创作', unit: '个草稿', initial: 1, step: 1, limit: 5, max: 30, label: '完成' },
  connect: { area: '人际连接', unit: '位朋友', initial: 1, step: 1, limit: 3, max: 10, label: '问候' },
  reflect: { area: '自我回顾', unit: '句日记', initial: 3, step: 1, limit: 10, max: 100, label: '写下' },
}
const areaNames = Object.values(seriesSpecs).map(s => s.area)
const text = (v, max) => typeof v === 'string' && v.length <= max
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const instant = v => typeof v === 'string' && v.length <= 30 && Number.isFinite(Date.parse(v))
export const goalTitle = (series, goal) => `${seriesSpecs[series].label} ${goal} ${seriesSpecs[series].unit}`
export function validGoal(series, goal) {
  return Object.hasOwn(seriesSpecs, series) && Number.isFinite(goal) && goal > 0 && goal <= seriesSpecs[series].max && (series === 'run' ? Math.abs(goal * 10 - Math.round(goal * 10)) < 0.00001 : Number.isInteger(goal))
}
export function validateRecord(r) {
  const plan = p => p && text(p.title, 120) && p.title.trim() && text(p.note, 1000) && Number.isInteger(p.minutes) && p.minutes >= 1 && p.minutes <= 240 && (p.goal === null || validGoal(r.series, p.goal))
  if (!r || !text(r.candidateId, 128) || !r.candidateId || !date(r.date) || !instant(r.acceptedAt) || !areaNames.includes(r.area) ||
      !(r.series === '' || Object.hasOwn(seriesSpecs, r.series)) || (r.series && seriesSpecs[r.series].area !== r.area) ||
      typeof r.trackProgress !== 'boolean' || (r.trackProgress && (!r.series || !validGoal(r.series, r.goal))) ||
      !(r.goal === null || validGoal(r.series, r.goal)) || !Number.isInteger(r.minutes) || r.minutes < 1 || r.minutes > 240 ||
      !plan(r.original) || !plan(r.accepted) || !Array.isArray(r.changes) || r.changes.length > 20 || !r.changes.every(p => plan(p) && instant(p.at)) ||
      !(r.completedDate === '' || date(r.completedDate))) throw Error('推荐记录包含无效字段。')
  const copyPlan = p => ({ title: p.title, note: p.note, minutes: p.minutes, goal: p.goal })
  return { candidateId: r.candidateId, date: r.date, acceptedAt: r.acceptedAt, area: r.area, series: r.series, trackProgress: r.trackProgress, goal: r.goal, minutes: r.minutes, original: copyPlan(r.original), accepted: copyPlan(r.accepted), changes: r.changes.map(p => ({ ...copyPlan(p), at: p.at })), completedDate: r.completedDate }
}
export function localDate(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
