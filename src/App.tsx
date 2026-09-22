import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import { DailyQuote } from './DailyQuote'
import { RecommendationTaskFields } from './RecommendationTaskFields'
import { DailyRecommendations } from './DailyRecommendations'
import type { RecommendationHandle } from './DailyRecommendations'
import { ReminderTime } from './ReminderTime'
import type { ReminderTimeHandle } from './ReminderTime'
import { categories, dateKey, isDesktop, repository } from './taskRepository'
import type { StorageInfo, Task } from './taskRepository'
import { useTasks } from './useTasks'
import { maxBytes, parseTasks } from '../shared/tasks.mjs'

const categoryColors: Record<string, number> = { '课外': 0, '个人': 1, '课内': 2, '生活': 3 }
const today = () => dateKey(new Date())
const blank = (): Task => ({ id: crypto.randomUUID(), title: '', note: '', category: '课外', priority: '中', due: `${today()}T18:00`, done: false, reminded: false })
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    bell: <path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4l-2 3Zm5 4h4"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>,
    edit: <path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m9 3 1-1h4l1 3 3 1 3 2-1 3 1 3-2 3-3 1-2 3h-4l-1-3-3-1-3-2 1-3-1-3 2-3 3-1Z"/></>,
    arrow: <path d="m9 5 7 7-7 7"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>
}
export default function App() {
  const [view, setView] = useState('今天')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [sort, setSort] = useState('时间排序')
  const [draft, setDraft] = useState<Task>(blank)
  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState('')
  const { tasks, alerts, ready, error, command } = useTasks(setToast)
  const importInput = useRef<HTMLInputElement>(null)
  const storageDialog = useRef<HTMLDialogElement>(null)
  const settingsDialog = useRef<HTMLDialogElement>(null)
  const recommendations = useRef<RecommendationHandle>(null)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [showAlerts, setShowAlerts] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(today())
  const dialog = useRef<HTMLDialogElement>(null)
  const reminderTime = useRef<ReminderTimeHandle>(null)
  const [editorSession, setEditorSession] = useState(0)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer) }, [toast])
  const day = dateKey(new Date(now))
  const todayTasks = tasks.filter(t => t.due.startsWith(day))
  const completed = todayTasks.filter(t => t.done).length
  const progress = todayTasks.length ? Math.round(completed / todayTasks.length * 100) : 0
  const pending = tasks.filter(t => !t.done)
  const viewTasks = tasks.filter(t => view === '今天' ? t.due.startsWith(day) : view === '即将到来' ? !t.done && t.due.slice(0, 10) > day : view === '已完成' ? t.done : view === '日历' ? t.due.startsWith(selectedDate) : categories.includes(view) ? t.category === view : true)
  const visible = viewTasks.filter(t => (filter === '全部' || (filter === '未完成' ? !t.done : t.done)) && `${t.title} ${t.note}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(a.done) - Number(b.done) || (sort === '优先级排序' ? ['高', '中', '低'].indexOf(a.priority) - ['高', '中', '低'].indexOf(b.priority) : (a.due || '9999').localeCompare(b.due || '9999')))
  const next = pending.filter(t => t.due && new Date(t.due).getTime() > now).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3)
  function openEditor(task?: Task) { setEditorSession(previous => previous + 1); setEditing(Boolean(task)); setDraft(task ? { ...task } : { ...blank(), category: categories.includes(view) ? view : '课外', due: `${view === '日历' ? selectedDate : day}T18:00` }); dialog.current?.showModal() }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft.title.trim()) return
    const due = reminderTime.current?.commit()
    if (due == null) return
    const old = tasks.find(t => t.id === draft.id)
    const task = { ...draft, due, title: draft.title.trim(), reminded: old?.due === due ? old.reminded : false }
    if (await command({ type: 'upsert', task })) { dialog.current?.close(); setToast(editing ? '任务已更新' : '新任务已添加，慢慢来，一件件完成。') }
  }
  async function enableNotifications() {
    if (isDesktop) { setToast('桌面提醒已启用。关闭窗口后仍在托盘运行；请允许 Windows 通知。退出程序或关机期间不提醒。'); return }
    if (!('Notification' in window)) { setToast('当前浏览器不支持系统通知，仍可接收页面内提醒。'); return }
    try { const permission = await Notification.requestPermission(); setToast(permission === 'granted' ? '系统通知已开启。请保持页面打开以接收提醒。' : '未开启系统通知，仍可接收页面内提醒。') } catch { setToast('无法开启系统通知，仍可接收页面内提醒。') }
  }
  async function importFile(file?: File) {
    if (!file) return
    try {
      if (file.size > maxBytes) throw Error('任务文件不能超过 10 MB。')
      const text = await file.text()
      const imported = parseTasks(text)
      const existingIds = new Set(tasks.map(task => task.id))
      const added = imported.filter(task => !existingIds.has(task.id)).length
      if (!window.confirm(`将合并文件中的 ${imported.length} 条任务：预计新增 ${added} 条，其余为相同编号，保留本机版本。现有任务不会删除，导入前会自动备份。是否继续？`)) return
      if (await command({ type: 'import', text })) setToast(`任务已合并，现有任务已保留。导入前备份可在“数据与备份”中查看。`)
    } catch (e) { setToast(e instanceof Error ? e.message : '导入失败，未修改现有数据。') }
  }
  async function exportFile(backup = false) {
    try { const location = await repository.exportFile(backup); if (location) setToast(isDesktop ? `已导出到：${location}` : location) }
    catch (e) { setToast(`导出失败。${e instanceof Error ? e.message : '请检查保存位置和磁盘空间。'}`) }
  }
  async function showStorageInfo() {
    try { setStorageInfo(await repository.storageInfo()); storageDialog.current?.showModal() }
    catch { setToast('无法读取数据位置，请重试。') }
  }
  async function openDataFolder() {
    try { await repository.openDataFolder() } catch { setToast('无法打开数据文件夹，请按显示的路径手动打开。') }
  }
  const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1))
  const nav = [['今天', 'sun'], ['全部任务', 'grid'], ['即将到来', 'calendar'], ['已完成', 'check']]
  if (!ready) return <main className="startup-message" role={error ? 'alert' : 'status'}><h1>小日 · 待办事项</h1><p>{error || '正在读取任务…'}</p>{error && <button className="secondary-button" onClick={() => window.location.reload()}>重新读取</button>}</main>
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setView('今天') }}><span className="brand-icon"><Icon name="check" size={24}/></span><span>小日<span className="brand-en">little day</span></span></a>
      <div className="workspace"><span className="avatar">L</span><div>我的个人空间<small>把日子过得有条理</small></div><span className="workspace-dots">···</span></div>
      <div className="nav-label">我的待办</div>
      <nav>{nav.map(([label, icon]) => <button key={label} className={`nav-item ${view === label ? 'active' : ''}`} onClick={() => { setView(label); setFilter('全部') }}><Icon name={icon}/><span>{label}</span><span className="count">{label === '今天' ? todayTasks.filter(t => !t.done).length : label === '已完成' ? tasks.filter(t => t.done).length : label === '即将到来' ? pending.filter(t => t.due.slice(0, 10) > day).length : tasks.length}</span></button>)}</nav>
      <div className="nav-label category-label">我的分类 <span>4</span></div>
      <nav>{categories.map(c => <button key={c} className={`nav-item ${view === c ? 'active' : ''}`} onClick={() => { setView(c); setFilter('全部') }}><span className={`category-dot dot-${categoryColors[c]}`}/><span>{c}</span><span className="count">{pending.filter(t => t.category === c).length}</span></button>)}</nav>
      <div className="sidebar-bottom"><DailyQuote date={day}/><div className="local-status"><span/> {isDesktop ? '数据保存在此电脑' : '数据保存在此浏览器'}</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">我的空间 <Icon name="arrow" size={13}/><span>{view}</span></div><div className="header-actions"><span className="header-date">{new Date(now).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span><button className="icon-button" aria-label="设置" onClick={() => settingsDialog.current?.showModal()}><Icon name="settings"/></button><button className="icon-button notification-button" aria-label="查看提醒" onClick={() => setShowAlerts(!showAlerts)}><Icon name="bell"/>{alerts.length > 0 && <i/>}</button><span className="avatar small-avatar">L</span></div></header>
      <div className="content-grid"><main>
        <section className="page-heading"><div className="eyebrow">A LITTLE FOCUS, A BETTER DAY</div><div className="heading-row"><div><h1>{view === '今天' ? '今天，也要从容一点' : view === '日历' ? `${selectedDate.slice(5).replace('-', '月')}日的安排` : view}<span className="heading-spark">✳</span></h1><p>清空脑海里的琐事，把专注留给重要的事。</p></div><button className="primary-button" onClick={() => openEditor()}><Icon name="plus" size={18}/>新建任务</button></div></section>
        <div className="data-actions"><span>{isDesktop ? '已保存到本机 · 关闭窗口后在托盘运行' : '数据保存在此浏览器 · 可导出迁移至桌面版'}</span><div><button onClick={() => void exportFile()}>导出任务</button><button onClick={() => importInput.current?.click()}>导入任务</button><button onClick={() => void showStorageInfo()}>数据与备份</button></div><input ref={importInput} className="sr-only" type="file" accept=".json,application/json" aria-label="导入任务文件" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = '' }}/></div><section className="stats"><div className="stat"><span className="stat-icon lavender"><Icon name="calendar"/></span><div><span>今日任务</span><strong>{todayTasks.length}<small>件待办</small></strong></div></div><div className="stat"><span className="stat-icon peach"><Icon name="clock"/></span><div><span>等待完成</span><strong>{todayTasks.length - completed}<small>慢慢来，不着急</small></strong></div></div><div className="stat"><span className="stat-icon mint"><Icon name="check"/></span><div><span>已完成</span><strong>{completed}<small>每一步都是进步</small></strong></div></div></section>
        <section className="task-panel"><div className="task-title"><h2>{view === '今天' ? '今日清单' : view === '日历' ? '当日清单' : view}<span>{viewTasks.length}</span></h2><select className="sort" aria-label="任务排序" value={sort} onChange={e => setSort(e.target.value)}><option>时间排序</option><option>优先级排序</option></select></div><div className="task-toolbar"><div className="tabs">{['全部', '未完成', '已完成'].map(f => <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'selected' : ''}>{f}</button>)}</div><label className="search"><Icon name="search" size={16}/><input placeholder="搜索任务…" aria-label="搜索任务" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
        <div className="task-list">{visible.map(t => { const overdue = !t.done && t.due && new Date(t.due).getTime() < now; return <article className={`task-row ${t.done ? 'is-done' : ''}`} key={t.id}><button className={`checkbox ${t.done ? 'checked' : ''}`} aria-label={`${t.done ? '取消完成' : '完成'}：${t.title}`} onClick={() => void command({ type: 'toggle', id: t.id })}>{t.done && <Icon name="check" size={14}/>}</button><div className="task-body"><button className="task-name" onClick={() => openEditor(t)}>{t.title}</button>{t.note && <p>{t.note}</p>}<div className="task-meta"><span className={`category-tag tag-${categoryColors[t.category]}`}>{t.category}</span>{t.due && <span className={overdue ? 'overdue' : ''}><Icon name="clock" size={13}/>{t.due.startsWith(day) ? '今天' : t.due.slice(5, 10).replace('-', '/')} {t.due.slice(11, 16)}{overdue && ' · 已逾期'}</span>}<span className={`priority priority-${t.priority}`}>⚑ {t.priority}优先级</span></div></div><div className="row-actions"><button className="icon-button" aria-label={`编辑：${t.title}`} onClick={() => openEditor(t)}><Icon name="edit" size={16}/></button><button className="icon-button delete" aria-label={`删除：${t.title}`} onClick={async () => { if (await command({ type: 'delete', id: t.id })) setToast('任务已删除') }}><Icon name="trash" size={16}/></button></div></article> })}{!visible.length && <div className="empty-state"><span>☁</span><h3>{query ? '没有找到匹配的任务' : '这里暂时没有待办'}</h3><p>{query ? '换一个关键词试试吧。' : '留一点空白，或者开始一个新的小计划。'}</p></div>}</div><button className="add-task" onClick={() => openEditor()}><Icon name="plus" size={18}/>添加一个新的小目标<span>让想法落在这里</span></button></section>
        <div hidden={view !== '今天'}><DailyRecommendations key={day} ref={recommendations} date={day} tasks={tasks} onAdd={task => command({ type: 'upsert', task })} notify={setToast}/></div>
        <footer className="main-footer"><span>✦</span> 按自己的节奏，把今天过好。</footer>
      </main><aside className="right-panel"><section className="calendar-card"><div className="calendar-header"><h3>{month.getFullYear()} 年 {month.getMonth() + 1} 月</h3><div><button className="icon-button previous" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="arrow" size={15}/></button><button className="icon-button" aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="arrow" size={15}/></button></div></div><div className="calendar-grid">{'一二三四五六日'.split('').map(d => <span className="weekday" key={d}>{d}</span>)}{days.map(d => <button key={dateKey(d)} aria-label={dateKey(d)} className={`${d.getMonth() !== month.getMonth() ? 'muted-day' : ''} ${dateKey(d) === day ? 'today' : ''} ${view === '日历' && dateKey(d) === selectedDate ? 'chosen-day' : ''}`} onClick={() => { setSelectedDate(dateKey(d)); setView('日历'); setFilter('全部') }}>{d.getDate()}{pending.some(t => t.due.startsWith(dateKey(d))) && <i/>}</button>)}</div><button className="back-today" onClick={() => { setMonth(new Date()); setView('今天'); setFilter('全部') }}>回到今天</button></section>
        <section className="progress-card"><div className="section-title"><h3>今天的进度</h3><span>继续保持 ✨</span></div><div className="progress-content"><div className="progress-ring" style={{ background: `conic-gradient(#8b79ce ${progress}%, #ebe7f5 0)` }}><div><strong>{progress}<small>%</small></strong><span>已完成</span></div></div><p>已经完成 <b>{completed}</b> 件事<br/>小小积累，大大满足。</p></div><div className="progress-track"><span style={{ width: `${progress}%` }}/></div><div className="progress-caption">今日目标<span>{completed} / {todayTasks.length}</span></div></section>
        <section className="upcoming-card"><div className="section-title"><h3><Icon name="bell" size={17}/>接下来的提醒</h3><span>{next.length} 项</span></div>{next.length ? next.map(t => <button className="reminder-item" key={t.id} onClick={() => openEditor(t)}><span className={`reminder-dot dot-${categoryColors[t.category]}`}/><span><strong>{t.title}</strong><small>{t.due.startsWith(day) ? '今天' : t.due.slice(5, 10)} · {t.due.slice(11, 16)}</small></span></button>) : <p className="no-reminders">暂时没有即将到来的提醒，享受当下。</p>}<button className="enable-notifications" onClick={enableNotifications}><Icon name="bell" size={15}/>{isDesktop ? '桌面提醒已启用' : '开启浏览器通知'}<Icon name="arrow" size={13}/></button><p className="notification-hint">{isDesktop ? '关闭窗口后在托盘继续提醒；退出后停止' : '保持页面打开，及时收到到期提醒'}</p></section>
        <section className="quote-card"><span className="quote-mark">“</span><p>生活的美好，<br/>藏在每一个认真对待的今天。</p><span className="quote-line"/><small>MAKE ROOM FOR WHAT MATTERS</small><div className="plant">✳</div></section>
      </aside></div>
    </div>
    <dialog ref={settingsDialog} className="task-dialog settings-dialog" aria-labelledby="settings-heading" onClick={event => { if (event.target === event.currentTarget) settingsDialog.current?.close() }}>
      <div className="dialog-heading"><h2 id="settings-heading">设置</h2><button className="icon-button" aria-label="关闭设置" onClick={() => settingsDialog.current?.close()}><Icon name="close"/></button></div>
      <button className="settings-entry" onClick={() => { settingsDialog.current?.close(); recommendations.current?.openPreferences() }}><span><strong>推荐偏好</strong><small>调整兴趣领域、推荐数量和每日可用时间</small></span><Icon name="arrow" size={17}/></button>
    </dialog>
    <dialog ref={storageDialog} className="task-dialog storage-dialog" onClick={event => { if (event.target === event.currentTarget) storageDialog.current?.close() }}>
      <div className="dialog-heading"><h2>数据与备份</h2><button className="icon-button" aria-label="关闭数据与备份" onClick={() => storageDialog.current?.close()}><Icon name="close"/></button></div>
      <h3>自动保存的任务</h3><p>{storageInfo?.dataPath}</p>
      <h3>上次导入前的备份</h3><p>{storageInfo?.hasBackup ? storageInfo.backupPath : '尚无备份；首次确认导入时会自动创建。'}</p>
      <p>备份保留最近一次导入前的数据。如需找回任务，先导出上次备份，再通过“导入任务”合并回来。</p>
      <h3>手动导出的 JSON</h3><p>{isDesktop ? '导出时可选择文件夹，默认是“下载”。导出的文件与上面的自动保存文件相互独立。' : '由浏览器保存，通常在“下载”文件夹；请在浏览器下载列表查看实际位置。自动备份仍在此浏览器中，需要单独导出。'}</p>
      <div className="dialog-footer">{isDesktop && <button className="secondary-button" onClick={() => void openDataFolder()}>打开数据文件夹</button>}<button className="primary-button" disabled={!storageInfo?.hasBackup} onClick={() => void exportFile(true)}>导出上次备份</button></div>
    </dialog>
    {toast && <div className="toast" role="status"><Icon name="bell" size={18}/><span>{toast}</span><button aria-label="关闭提示" className="icon-button" onClick={() => setToast('')}><Icon name="close" size={15}/></button></div>}
    {showAlerts && <section className="alerts-popover"><div className="section-title"><h3>提醒记录</h3><button className="icon-button" aria-label="关闭提醒" onClick={() => setShowAlerts(false)}><Icon name="close" size={16}/></button></div>{alerts.length ? alerts.map((t, i) => <div className="alert-entry" key={`${t.id}-${i}`}><strong>{t.title}</strong><small>{t.due.replace('T', ' ')} 已到期</small></div>) : <p>暂无提醒。为任务设置时间，到期后会在这里提醒你。</p>}</section>}
    <dialog ref={dialog} className="task-dialog" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }}><form onSubmit={save}><div className="dialog-heading"><div><span className="eyebrow">ONE LITTLE STEP</span><h2>{editing ? '编辑任务' : '一个新的小目标'}</h2></div><button type="button" className="icon-button" aria-label="关闭编辑" onClick={() => dialog.current?.close()}><Icon name="close"/></button></div><label>准备做点什么？<input autoFocus required maxLength={120} placeholder="写下你想完成的事…" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><label>备注<textarea rows={3} maxLength={1000} placeholder="补充一点细节（选填）" value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })}/></label><div className="form-columns"><label>分类<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>优先级<select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })}>{['高', '中', '低'].map(p => <option key={p}>{p}</option>)}</select></label></div><RecommendationTaskFields task={draft} onChange={setDraft}/><ReminderTime key={editorSession} ref={reminderTime} value={draft.due} onChange={due => setDraft(previous => ({ ...previous, due }))}/><p className="form-help">{isDesktop ? '时间可留空。程序在托盘运行时也会提醒。' : '时间可留空。页面打开时，到期会自动提醒。'}</p><div className="dialog-footer"><button className="secondary-button" type="button" onClick={() => dialog.current?.close()}>取消</button><button className="primary-button" type="submit">{editing ? '保存修改' : '添加任务'}<Icon name="check" size={17}/></button></div></form></dialog>
  </div>
}
