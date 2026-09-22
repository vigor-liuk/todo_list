import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { FormEvent, Ref } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from './taskRepository'
import { areas, attitudes, batchKey, enrichBatch, generateBatch, needsPreferenceOnboarding, onboardingKey, preferenceKey, readBatch, readPreferences, recommendationKey, validPreferences } from './recommendations'
import type { Attitude, DailyBatch, Preferences, Recommendation } from './recommendations'
import { RecommendationPicker } from './RecommendationPicker'

export type RecommendationHandle = { openPreferences(): void }

export function DailyRecommendations({ date, tasks, onAdd, notify, ref }: { date: string; tasks: Task[]; onAdd: (task: Task) => Promise<boolean>; notify: (message: string) => void; ref?: Ref<RecommendationHandle> }) {
  const [onboarding, setOnboarding] = useState(needsPreferenceOnboarding)
  const [preferences, setPreferences] = useState(readPreferences)
  const [draft, setDraft] = useState<Preferences>(preferences)
  const [batch, setBatch] = useState<DailyBatch>(() => readBatch(batchKey(date, preferences, 0)) || generateBatch(date, preferences, tasks))
  const [loading, setLoading] = useState(() => !onboarding && preferences.online && batch.items.length > 0 && !readBatch(batchKey(date, preferences, 0)))
  const [choosing, setChoosing] = useState<Recommendation | null>(null)
  const historyDialog = useRef<HTMLDialogElement>(null)
  const [formError, setFormError] = useState('')
  const [storageError, setStorageError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const taskSnapshot = useRef(tasks)
  const key = batchKey(date, preferences, 0)
  function openPreferences() {
    setDraft({ ...preferences, areaAttitudes: { ...preferences.areaAttitudes } })
    setFormError(''); dialog.current?.showModal()
  }
  useImperativeHandle(ref, () => ({ openPreferences }))
  useEffect(() => {
    if (onboarding && !dialog.current?.open) dialog.current?.showModal()
  }, [onboarding])
  useEffect(() => { taskSnapshot.current = tasks }, [tasks])
  useEffect(() => {
    // Let a new user choose exclusions before requesting recommendation sources.
    if (onboarding) return
    let active = true
    const cached = readBatch(key)
    if (cached) return
    const initial = generateBatch(date, preferences, taskSnapshot.current)
    enrichBatch(initial, preferences.online).then(result => {
      if (!active) return
      setBatch(result); setLoading(false)
      try { localStorage.setItem(recommendationKey, JSON.stringify(result)); setStorageError('') }
      catch { setStorageError('推荐暂未保存，刷新后可能重新生成；现有任务不受影响。') }
    })
    return () => { active = false }
  }, [date, preferences, key, onboarding])

  const current = batch?.key === key ? batch : null
  const isAdded = (item: Recommendation) => tasks.some(t => t.id === item.id || (t.title === item.title && (!t.done || t.due.startsWith(date))))
  function savePreferences(event: FormEvent) {
    event.preventDefault()
    const value = { ...draft, interests: draft.interests.trim() }
    if (!validPreferences(value)) { setFormError('推荐偏好无效，请检查各领域的选择后重试。'); return }
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(value))
      const cached = readBatch(batchKey(date, value, 0))
      const next = cached || generateBatch(date, value, tasks)
      setBatch(next); setLoading(value.online && next.items.length > 0 && !cached)
      setPreferences(value); setOnboarding(false); setFormError(''); dialog.current?.close()
    } catch { setFormError('偏好保存失败，请检查本地存储空间后重试。') }
  }
  function closePreferences() {
    if (onboarding) {
      try { localStorage.setItem(onboardingKey, 'skipped') }
      catch { setFormError('暂时无法保存跳过状态，请检查本地存储空间后重试。'); return }
      setLoading(preferences.online && batch.items.length > 0 && !readBatch(key))
      setOnboarding(false)
    }
    setFormError(''); dialog.current?.close()
  }
  function skip(id?: string) {
    if (!current) return
    const updated = { ...current, skipped: id ? [...new Set([...current.skipped, id])] : [] }
    try { localStorage.setItem(recommendationKey, JSON.stringify(updated)); setBatch(updated); setStorageError('') }
    catch { setStorageError('未能保存跳过操作，请检查本地存储空间后重试。') }
  }
  const history = tasks.filter(t => t.recommendation).sort((a, b) => b.recommendation!.acceptedAt.localeCompare(a.recommendation!.acceptedAt))
  const selectedToday = history.filter(t => t.recommendation!.date === date).length

  return <section className="recommendations" aria-labelledby="recommendation-heading">
    <div className="recommendation-heading"><div><span className="eyebrow">A LITTLE INSPIRATION</span><h2 id="recommendation-heading">每日推荐 <span>✦</span></h2><p>给日常留一点新意，从感兴趣的小事开始。</p></div><button className="secondary-button" onClick={openPreferences}>推荐偏好</button></div>
    <div className="recommendation-summary"><span>{date.slice(5).replace('-', '/')} · {current?.items.length ?? preferences.count} 个候选 · 今天已选 {selectedToday} 个</span><span>{current?.items.length === 0 ? '所有领域已关闭' : loading ? '正在搜索公开资料…' : !preferences.online ? '本地推荐 · 联网已关闭' : current?.onlineCount ? `已联网 · ${current.onlineCount} 条附参考资料` : '网络不可用或未找到资料 · 使用本地建议'}</span></div>
    <div className="candidate-choice-hint"><span>选一两件喜欢的就好，不必全部完成。</span><button onClick={() => historyDialog.current?.showModal()}>选择与调整记录</button></div>
    {current?.items.length === 0 && <div className="recommendation-empty"><h3>已暂停每日推荐</h3><p>所有领域都标记了“不感兴趣”。在推荐偏好中将任意领域改为“感兴趣”或“未明确”，即可恢复。</p></div>}
    <div className="recommendation-grid" aria-busy={loading}>{current?.items.filter(item => !current.skipped.includes(item.id)).map(item => {
      const added = isAdded(item)
      return <article className="recommendation-card" key={item.id}>
        <div className="recommendation-meta"><span>{item.area}</span><span>{item.minutes} 分钟</span></div>
        <h3>{item.title}</h3><p>{item.note}</p><p className="recommendation-reason">{item.reason}</p>
        <div className="recommendation-source">{item.source ? <a href={item.source.url} target="_blank" rel="noreferrer">参考：{item.source.title} ↗</a> : <span>小日本地建议</span>}</div>
        <div className="recommendation-actions"><button disabled={added || loading} onClick={() => setChoosing(item)}>{added ? '已在清单中' : '选择并调整'}</button><button disabled={loading || added} aria-label={`跳过：${item.title}`} onClick={() => skip(item.id)}>今天跳过</button></div>
      </article>
    })}</div>
    {current && current.skipped.length > 0 && <div className="recommendation-skipped">今天已跳过 {current.skipped.length} 个建议。<button onClick={() => skip()}>恢复已跳过建议</button></div>}
    <p className="recommendation-footnote">每天更新候选，接受前可调整目标和时间。递进目标以实际选择和完成记录为依据；不感兴趣的领域始终排除。联网不上传任务与调整记录。</p>
    {choosing && <RecommendationPicker item={choosing} date={date} onClose={() => setChoosing(null)} onConfirm={async task => { if (isAdded(choosing)) return false; const ok = await onAdd(task); if (ok) notify('已按你的选择加入计划，并保存原推荐与调整记录。'); return ok }}/>}
    {createPortal(<dialog ref={historyDialog} className="task-dialog recommendation-history" aria-labelledby="history-heading" onClick={e => { if (e.target === e.currentTarget) historyDialog.current?.close() }}><div className="dialog-heading"><h2 id="history-heading">选择与调整记录</h2><button className="icon-button" aria-label="关闭选择记录" onClick={() => historyDialog.current?.close()}>×</button></div><p className="preference-help">保留原推荐、首次接受和最近 20 次修改；这些记录随任务一起导出。删除任务也会删除其记录。</p>{!history.length && <p className="preference-help">还没有接受过推荐。先选一件想做的小事吧。</p>}{history.map(task => <article className="history-entry" key={task.id}><small>{task.recommendation!.date} · {task.recommendation!.area} · {task.done ? '已完成' : '未完成'}</small><p>原推荐：{task.recommendation!.original.title} · {task.recommendation!.original.minutes} 分钟</p><p>首次接受：{task.recommendation!.accepted.title} · {task.recommendation!.accepted.minutes} 分钟</p><strong>当前计划：{task.title} · {task.recommendation!.minutes} 分钟</strong><details><summary>查看内容和后续修改</summary><p>接受时备注：{task.recommendation!.accepted.note}</p>{task.recommendation!.changes.map((change, i) => <p key={i}>{new Date(change.at).toLocaleString('zh-CN')} · {change.title} · {change.minutes} 分钟<br/>{change.note}</p>)}</details></article>)}</dialog>, document.body)}
    {storageError && <p className="time-error">{storageError}</p>}
    {createPortal(<dialog ref={dialog} aria-labelledby="preference-heading" className={`task-dialog preference-dialog${onboarding ? ' onboarding-dialog' : ''}`} onCancel={event => { event.preventDefault(); closePreferences() }} onClick={event => { if (event.target === event.currentTarget) closePreferences() }}>
      <form onSubmit={savePreferences}><div className="dialog-heading"><div>{onboarding && <span className="eyebrow">WELCOME TO LITTLE DAY</span>}<h2 id="preference-heading" tabIndex={-1} autoFocus={onboarding}>{onboarding ? '先选兴趣，让小日更懂你' : '我的推荐偏好'}</h2></div><button type="button" className="icon-button" aria-label="关闭推荐偏好" onClick={closePreferences}>×</button></div>
        {onboarding && <p className="onboarding-intro">欢迎来到小日。选出你喜欢和不想看到的领域，让每天的小建议更合心意。之后随时可以在右上角“设置 → 推荐偏好”中修改。</p>}
        <div className="preference-fields">
        <fieldset><legend>告诉我们你对各领域的态度</legend><p className="attitude-help">感兴趣的多推荐，未明确的少量探索，不感兴趣的不推荐。</p><div className="area-attitudes">{areas.map(area => <fieldset className="area-attitude" key={area}><legend>{area}</legend><div>{(Object.entries(attitudes) as [Attitude, string][]).map(([attitude, label]) => <label key={attitude} className={draft.areaAttitudes[area] === attitude ? `attitude-selected attitude-${attitude}` : ''}><input type="radio" name={`attitude-${area}`} value={attitude} checked={draft.areaAttitudes[area] === attitude} onChange={() => setDraft({ ...draft, areaAttitudes: { ...draft.areaAttitudes, [area]: attitude } })}/>{label}</label>)}</div></fieldset>)}</div><p className="attitude-help">每天优先安排感兴趣领域，约八成候选来自感兴趣领域，其余少量探索。还没标记感兴趣时，每天提供 5 个探索候选；全部不感兴趣时暂停推荐。</p></fieldset>
        <label>我的兴趣<textarea aria-label="我的兴趣" rows={2} maxLength={120} placeholder="例如：摄影、英语、编程、文学；用逗号分隔" value={draft.interests} onChange={event => setDraft({ ...draft, interests: event.target.value })}/></label>
        <div className="form-columns"><label>每天候选数量<select value={draft.count} onChange={event => setDraft({ ...draft, count: Number(event.target.value) })}>{[5, 6, 7, 8, 9, 10].map(count => <option key={count} value={count}>{count} 个</option>)}</select></label><label>每日可用时间<select value={draft.minutes} onChange={event => setDraft({ ...draft, minutes: Number(event.target.value) })}>{[15, 30, 60].map(minutes => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}</select></label></div>
        <label className="online-option"><input type="checkbox" checked={draft.online} onChange={event => setDraft({ ...draft, online: event.target.checked })}/>每天联网寻找参考资料</label>
        <p className="preference-help">通过中文维基百科搜索公开知识资料，结果用于学习建议和延伸阅读，不代表当天新闻。偏好保存在本机；已有任务只在本地用于判断常用分类和忙碌程度。待办较多时自动缩短建议用时。</p>
        </div>
        {formError && <p className="time-error" role="alert">{formError}</p>}
        <div className="dialog-footer"><button type="button" className="secondary-button" onClick={closePreferences}>{onboarding ? '暂时跳过' : '取消'}</button><button className="primary-button" type="submit">{onboarding ? '选好了，开始使用' : '保存推荐偏好'}</button></div>
      </form>
    </dialog>, document.body)}
  </section>
}
