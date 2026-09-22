import type { Task } from './taskRepository'
import { goalTitle, seriesSpecs, validGoal } from '../shared/recommendation-record.mjs'
import type { Series } from '../shared/recommendation-record.mjs'

export const areas = ['学习成长', '运动休息', '生活整理', '人际连接', '兴趣创作', '自我回顾'] as const
export type Area = typeof areas[number]
export const attitudes = { interested: '感兴趣', neutral: '未明确', excluded: '不感兴趣' } as const
export type Attitude = keyof typeof attitudes
export type Preferences = { areaAttitudes: Record<Area, Attitude>; interests: string; count: number; minutes: number; online: boolean }
export type Recommendation = { id: string; area: Area; title: string; note: string; category: string; minutes: number; reason: string; query: string; series?: Series; goal?: number; source?: { title: string; url: string } }
export type DailyBatch = { key: string; date: string; items: Recommendation[]; skipped: string[]; onlineCount: number; searched: boolean }
export const preferenceKey = 'little-day-preferences-v1'
export const recommendationKey = 'little-day-recommendations-v1'
export const onboardingKey = 'little-day-recommendation-onboarding-v1'
export const defaults: Preferences = { areaAttitudes: Object.fromEntries(areas.map(area => [area, 'neutral'])) as Record<Area, Attitude>, interests: '', count: 8, minutes: 30, online: true }

export function validPreferences(value: unknown): value is Preferences {
  const p = value as Preferences | null
  return Boolean(p && p.areaAttitudes && typeof p.areaAttitudes === 'object' && !Array.isArray(p.areaAttitudes) && areas.every(area => Object.hasOwn(attitudes, p.areaAttitudes[area])) && typeof p.interests === 'string' && p.interests.length <= 120 && [5, 6, 7, 8, 9, 10].includes(p.count) && [15, 30, 60].includes(p.minutes) && typeof p.online === 'boolean')
}
export function parsePreferences(value: unknown): Preferences | null {
  if (value && typeof value === 'object' && 'count' in value && [3, 4].includes(value.count as number)) value = { ...value, count: 8 }
  if (validPreferences(value)) return value
  // Previously unchecked areas were explicitly disabled; preserve that intent on upgrade.
  const legacy = value as { areas?: unknown; areaAttitudes?: unknown } | null
  if (!legacy || legacy.areaAttitudes !== undefined || !Array.isArray(legacy.areas) || !legacy.areas.length || legacy.areas.length > areas.length || new Set(legacy.areas).size !== legacy.areas.length || !legacy.areas.every(area => areas.includes(area))) return null
  const migrated = { ...legacy, areaAttitudes: Object.fromEntries(areas.map(area => [area, (legacy.areas as Area[]).includes(area) ? 'interested' : 'excluded'])) }
  if (!validPreferences(migrated)) return null
  return { areaAttitudes: migrated.areaAttitudes, interests: migrated.interests, count: migrated.count, minutes: migrated.minutes, online: migrated.online }
}
export function readPreferences(): Preferences {
  try { const value = parsePreferences(JSON.parse(localStorage.getItem(preferenceKey) || 'null')); if (value) return value } catch { /* Use defaults for missing or invalid preferences. */ }
  return { ...defaults, areaAttitudes: { ...defaults.areaAttitudes } }
}
export function needsPreferenceOnboarding(): boolean {
  try {
    const dismissed = localStorage.getItem(onboardingKey)
    if (dismissed === 'skipped') return false
    return !parsePreferences(JSON.parse(localStorage.getItem(preferenceKey) || 'null'))
  } catch { return true }
}
export function batchKey(date: string, preferences: Preferences, revision: number) { return JSON.stringify(['choice-progress-v3', date, preferences, revision]) }
export function readBatch(key: string): DailyBatch | null {
  try {
    const b = JSON.parse(localStorage.getItem(recommendationKey) || 'null') as DailyBatch | null
    if (!b || b.key !== key || typeof b.date !== 'string' || !Array.isArray(b.items) || b.items.length > 10 || !Array.isArray(b.skipped) || !b.skipped.every(id => typeof id === 'string') || typeof b.searched !== 'boolean' || !Number.isInteger(b.onlineCount)) return null
    if (b.items.some(i => i.series !== undefined && (!validGoal(i.series, i.goal) || seriesSpecs[i.series]?.area !== i.area))) return null
    if (!b.items.every(i => typeof i.id === 'string' && i.id.length < 128 && areas.includes(i.area) && typeof i.title === 'string' && i.title.length <= 120 && typeof i.note === 'string' && i.note.length <= 700 && ['课内', '课外', '个人', '生活'].includes(i.category) && Number.isFinite(i.minutes) && i.minutes > 0 && typeof i.reason === 'string' && typeof i.query === 'string' && (!i.source || (typeof i.source.title === 'string' && /^https:\/\/zh\.wikipedia\.org\/wiki\/[^\s]+$/.test(i.source.url))))) return null
    return b
  } catch { return null }
}

const catalog: Record<Area, { category: string; topic: string; actions: [string, string][] }> = {
  '学习成长': { category: '课内', topic: '学习方法', actions: [
    ['学懂一个新概念', '挑一个好奇的概念，读一小段资料，再用自己的话写下理解。'],
    ['复习一个容易忘记的知识点', '不看笔记先回忆，再检查遗漏，留下一张简短的复习卡。'],
    ['带着一个问题阅读', '先写一个想弄懂的问题，阅读后记下答案和一个新疑问。'],
    ['整理一张知识卡片', '选一个最近学到的概念，写下定义和一个例子。'],
    ['解释一个学过的概念', '试着用简单的话讲明白，记下还解释不清的部分。'],
    ['检验一次自己的理解', '为学过的知识出一道小题，再尝试独立回答。'],
    ['比较两种解题思路', '找出相同点和不同点。'], ['整理一个学习疑问', '记录卡住的地方和下一步查找方向。'], ['画一张知识关系图', '用几个关键词连接今天学到的内容。'], ['回看一份学习笔记', '补充一个自己的例子。'],
  ] },
  '运动休息': { category: '个人', topic: '步行', actions: [
    ['离开屏幕，轻松走一走', '按自己舒适的节奏走动，留意周围的景色，也可以在室内完成。'],
    ['给眼睛和身体一段休息', '暂时放下屏幕，看看远处，换一个舒服的姿势。'],
    ['安排一次轻松的户外休息', '选择熟悉的路线，看看天气和自己的状态，再决定是否出门。'],
    ['留一段安静的休息时间', '暂停手头的事情，找一个舒适的位置，让注意力放松下来。'],
    ['听一首歌，放松片刻', '放下手头的任务，选一首喜欢的歌，给自己一小段休息。'],
    ['在忙碌之间换换环境', '起身去窗边或另一个房间，给自己一个短暂的停顿。'],
    ['安排一次舒适的散步', '根据自己的状态选择路线和时间。'], ['为喜欢的运动做准备', '检查常用装备，记下自己的计划。'], ['记录一次活动后的感受', '写下今天的状态和下次想调整的地方。'], ['找一个适合休息的地方', '给自己留一点安静时间。'],
  ] },
  '生活整理': { category: '生活', topic: '整理收纳', actions: [
    ['整理桌面的一小块区域', '选一个手掌大小的区域，把暂时用不到的物品归位。'],
    ['清理一小批数字杂物', '整理下载文件夹中的几个文件，保留重要内容，删除前确认用途。'],
    ['为明天准备一件小事', '检查明天要带的东西，或提前列好一张简短的购物清单。'],
    ['整理一个常用抽屉', '只选一个抽屉，把常用物品放到容易拿到的位置。'],
    ['检查家里的日常用品', '看看常用物品还有多少，只记录确实需要补充的东西。'],
    ['给一件物品找到固定位置', '选一件经常找不到的物品，为它留一个方便归还的位置。'],
    ['整理一页备忘录', '合并重复记录，留下重要内容。'], ['照顾家里的一株植物', '观察状态，按需要照料。'], ['整理一小块衣柜', '让常用衣物更容易找到。'], ['检查明天的随身物品', '提前准备，减少临时寻找。'],
  ] },
  '人际连接': { category: '个人', topic: '人际沟通', actions: [
    ['问候一位想念的人', '给朋友或家人写一句具体的问候，分享今天的一件小事。'],
    ['认真表达一次感谢', '想一位最近帮助过你的人，告诉对方哪件事让你感到温暖。'],
    ['为下一次相聚留个想法', '想一个可以一起做的小活动，记下来，合适时再邀请对方。'],
    ['分享一件有趣的小事', '把今天见到的有趣事物分享给一位可能喜欢它的人。'],
    ['认真听一个人的近况', '给一次交流留出专注的时间，先听对方说完。'],
    ['记下一个想关心的人', '想想谁最近需要支持，记下自己力所能及的一件小事。'],
    ['分享一段最近的收获', '找一个合适的人聊聊你的发现。'], ['记住一个重要的小细节', '记录朋友提到的喜好，方便以后关心。'], ['回应一条搁置的消息', '在方便时认真回复。'], ['回顾一次愉快的相处', '写下让你感到轻松的细节。'],
  ] },
  '兴趣创作': { category: '课外', topic: '创造力', actions: [
    ['完成一个很小的创作', '画一张草图、拍一张照片或写几句话，留下一个属于自己的作品。'],
    ['为喜欢的事情做一次练习', '选一个最小的练习动作，专注尝试一次，并记下想改进的地方。'],
    ['收集一个灵感并动手试试', '找一个感兴趣的点子，做一个小实验，记录自己的发现。'],
    ['换一种方式表达想法', '把一个想法改写成几句话、一张草图或一段旋律。'],
    ['完善一个已有的小作品', '翻出以前的草稿，只改进其中一个细节。'],
    ['记下三个创作点子', '不用评判好坏，记录想到的点子，再选最想尝试的一个。'],
    ['观察作品里的一个细节', '选一个喜欢的作品，记录它吸引你的原因。'], ['给旧作品起个名字', '试着概括想表达的内容。'], ['建立一个灵感分类', '整理几个已有想法，方便下次使用。'], ['尝试一种不同的素材', '做一个小尝试，记录感受。'],
  ] },
  '自我回顾': { category: '个人', topic: '日记', actions: [
    ['写下今天的一个小进步', '记录一件完成的小事，以及自己做对了什么。'],
    ['给明天选一个最重要的小目标', '看看已有安排，只挑一件最重要的事，并写出第一步。'],
    ['记录此刻的感受', '用几句话写下现在的状态，以及今天想留给自己的空间。'],
    ['回顾一件让自己开心的事', '写下发生了什么，以及它为什么对你有意义。'],
    ['给一个烦恼写下第一步', '把模糊的困扰写清楚，只选一个现在能做的小动作。'],
    ['为今天留下一句记录', '用一句话记录今天值得记住的事，不需要写得完美。'],
    ['给自己写一句鼓励', '具体说出今天做得不错的地方。'], ['回顾一次选择', '记录当时的考虑，以及现在的想法。'], ['列出一件想放下的事', '给自己留一点空间。'], ['检查计划是否适合自己', '只调整一个让你感到负担的安排。'],
  ] },
}

export function nextGoal(series: Series, tasks: Task[], date: string): { goal: number; reason: string } {
  const spec = seriesSpecs[series]
  const updatedAt = (t: Task) => t.recommendation!.changes.at(-1)?.at || t.recommendation!.acceptedAt
  const history = tasks.filter(t => t.recommendation?.series === series).sort((a, b) => updatedAt(b).localeCompare(updatedAt(a)))
  const latest = history[0]
  if (!latest) return { goal: spec.initial, reason: '从一个小目标开始，可按自己的状态调整' }
  const r = latest.recommendation!
  if (!r.trackProgress || r.goal === null) return { goal: spec.initial, reason: '上次内容已自定义，本次提供可重新调整的起点' }
  const lastTwo = history.slice(0, 2)
  const ready = lastTwo.length === 2 && lastTwo.every(t => t.done && t.recommendation!.trackProgress && t.recommendation!.goal === r.goal && t.recommendation!.completedDate && t.recommendation!.completedDate < date) && new Set(lastTwo.map(t => t.recommendation!.completedDate)).size === 2
  const increased = Math.round(Math.min(spec.limit, r.goal + spec.step) * 10) / 10
  if (ready && increased > r.goal) return { goal: increased, reason: `你已在两天完成 ${r.goal} ${spec.unit}，可以尝试一点进阶，也可调回原目标` }
  return { goal: r.goal, reason: `沿用你上次实际选择的 ${r.goal} ${spec.unit}${latest.done ? '，先保持节奏' : '，尚未完成时不增加目标'}` }
}

export function generateBatch(date: string, preferences: Preferences, tasks: Task[], revision = 0): DailyBatch {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000)
  const interests = preferences.interests.split(/[,，、;；\n]+/).map(s => s.trim()).filter(Boolean)
  const busy = tasks.filter(t => !t.done && t.due && t.due.slice(0, 10) <= date).length >= 5
  const preferredCategory = [...new Set(tasks.map(t => t.category))].sort((a, b) => tasks.filter(t => t.category === b).length - tasks.filter(t => t.category === a).length)[0]
  const rotate = (pool: Area[]) => pool.map((_, index) => pool[(index + day + revision) % pool.length])
  const interested = rotate(areas.filter(area => preferences.areaAttitudes[area] === 'interested'))
  const neutral = rotate(areas.filter(area => preferences.areaAttitudes[area] === 'neutral'))
  if (preferredCategory) interested.sort((a, b) => Number(catalog[b].category === preferredCategory) - Number(catalog[a].category === preferredCategory))
  if (interests.length) interested.sort((a, b) => Number(['学习成长', '兴趣创作'].includes(b)) - Number(['学习成长', '兴趣创作'].includes(a)))
  const neutralCount = neutral.length ? (interested.length ? Math.max(1, Math.round(preferences.count * 0.2)) : 5) : 0
  const interestedCount = interested.length ? preferences.count - neutralCount : 0
  const selected = [
    ...Array.from({ length: interestedCount }, (_, index) => interested[index % interested.length]),
    ...Array.from({ length: neutralCount }, (_, index) => neutral[index % neutral.length]),
  ]
  // Candidates are alternatives, not an obligation to complete the entire pool.
  const perTask = Math.max(3, Math.floor(Math.min(preferences.minutes, busy ? 15 : 60) / 2))
  const occurrences = new Map<Area, number>()
  const items: Recommendation[] = []
  for (let index = 0; index < selected.length; index++) {
    const area = selected[index]
    const entry = catalog[area]
    const occurrence = occurrences.get(area) || 0
    occurrences.set(area, occurrence + 1)
    const variants = entry.actions.map((_, i) => (i + day + revision) % entry.actions.length)
    const recent = tasks.filter(t => t.recommendation?.area === area && Date.parse(`${date}T00:00:00Z`) - Date.parse(`${t.recommendation.date}T00:00:00Z`) <= 7 * 86400000)
    const chosenBefore = (variant: number) => recent.some(t => t.recommendation!.original.title.startsWith(entry.actions[variant][0]))
    variants.sort((a, b) => Number(chosenBefore(a)) - Number(chosenBefore(b)))
    const variant = variants[Math.max(0, occurrence - 1) % variants.length]
    const interest = interests.length ? interests[(day + index + revision) % interests.length].slice(0, 40) : ''
    const personal = Boolean(interest && ['学习成长', '兴趣创作'].includes(area))
    let [title, note] = entry.actions[variant]
    if (personal) { title = `${title}：${interest}`; note = `围绕「${interest}」，${note}` }
    // IDs describe the action, so switching batches and changing preferences cannot overwrite accepted tasks.
    const id = `rec-${date}-${areas.indexOf(area)}-${variant}-${personal ? interest : 'general'}`
    if (items.some(i => i.id === id)) continue
    const attitudeReason = preferences.areaAttitudes[area] === 'interested' ? '你标记为感兴趣，优先推荐' : '你尚未明确态度，少量探索'
    const reason = `${attitudeReason}${personal ? `；与你的兴趣「${interest}」相关` : entry.category === preferredCategory ? `；结合常用的「${preferredCategory}」任务分类` : ''}`
    const series = (Object.keys(seriesSpecs) as Series[]).find(s => seriesSpecs[s].area === area)!
    if (occurrence === 0) {
      const progress = nextGoal(series, tasks, date)
      items.push({ id: `rec-${date}-${series}`, area, title: goalTitle(series, progress.goal), note: `这是一个可调整的小目标。${personal ? `可以围绕「${interest}」来做。` : ''}选择适合自己的程度，完成后再决定是否继续。`, category: entry.category, minutes: series === 'read' ? progress.goal : perTask, reason: `${reason}；${progress.reason}${busy ? '；待办较多，也可以先选更轻量的候选' : ''}`, query: personal ? interest : entry.topic, series, goal: progress.goal })
    } else items.push({ id, area, title, note, category: entry.category, minutes: perTask, reason: `${reason}${busy ? '；待办较多，安排轻量行动' : ''}`, query: personal ? interest : entry.topic })
  }
  return { key: batchKey(date, preferences, revision), date, items, skipped: [], onlineCount: 0, searched: false }
}

type Source = NonNullable<Recommendation['source']>
const searches = new Map<string, Promise<Source[]>>()
let searchDay = ''
function search(date: string, query: string): Promise<Source[]> {
  if (searchDay !== date) { searches.clear(); searchDay = date }
  const key = JSON.stringify([date, query])
  const pending = searches.get(key)
  if (pending) return pending
  const request = (async () => {
    try {
      const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '5', srprop: '', format: 'json', formatversion: '2', origin: '*' })
      const response = await fetch(`https://zh.wikipedia.org/w/api.php?${params}`, { signal: AbortSignal.timeout(6500), credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) return []
      const data = await response.json()
      if (!Array.isArray(data?.query?.search)) return []
      return data.query.search.filter((r: { title?: unknown }) => typeof r.title === 'string' && r.title.trim() && r.title.length <= 60).slice(0, 5).map((r: { title: string }) => ({ title: r.title, url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(r.title)}` })) as Source[]
    } catch { return [] }
  })()
  searches.set(key, request)
  return request
}
export async function enrichBatch(batch: DailyBatch, online: boolean): Promise<DailyBatch> {
  if (!online) return batch
  const day = Math.floor(Date.parse(`${batch.date}T00:00:00Z`) / 86400000)
  const items = await Promise.all(batch.items.map(async (item, index) => {
    const results = await search(batch.date, item.query)
    const source = results.length ? results[(day + index) % results.length] : undefined
    if (!source) return item
    // Only a learning action depends directly on the retrieved article; other sources are optional background reading.
    return { ...item, source, ...(item.area === '学习成长' && !item.series ? { title: `${item.title.slice(0, 45)}：${source.title}`, note: `${item.note} 参考「${source.title}」，从中选一个小知识点开始。` } : {}) }
  }))
  return { ...batch, items, searched: true, onlineCount: items.filter(i => i.source).length }
}
