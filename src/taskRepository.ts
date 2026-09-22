import { applyCommand, categories, dueTasks, markReminded, parseTasks, serializeTasks, storageKey } from '../shared/tasks.mjs'
import type { Command, Snapshot, Task } from '../shared/tasks.mjs'
export type { Task } from '../shared/tasks.mjs'
export { categories }

export type StorageInfo = { dataPath: string; backupPath: string; hasBackup: boolean }
type DesktopBridge = {
  load(): Promise<Snapshot>
  command(command: Command): Promise<Snapshot>
  exportFile(backup?: boolean): Promise<string | null>
  storageInfo(): Promise<StorageInfo>
  openDataFolder(): Promise<void>
  onChange(callback: (snapshot: Snapshot) => void): () => void
  onError(callback: (message: string) => void): () => void
}
declare global { interface Window { littleDay?: DesktopBridge } }
export const isDesktop = Boolean(window.littleDay)
export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function sampleTasks(): Task[] {
  const day = dateKey(new Date())
  return [
    ['整理本周工作计划', '梳理优先事项，让新的一周有条不紊。', '课外', '高', '09:30', true],
    ['完成产品首页设计', '完善页面布局与交互细节，准备设计评审。', '课外', '高', '23:00', false],
    ['阅读 30 分钟', '给自己留一点时间，读几页喜欢的书。', '课内', '中', '23:15', false],
    ['出门走走，给大脑充个电', '放下屏幕，感受一下今天的风。', '个人', '低', '23:30', false],
    ['补充冰箱里的水果', '', '生活', '低', '23:45', false],
  ].map(([title, note, category, priority, time, done]) => ({ id: crypto.randomUUID(), title: String(title), note: String(note), category: String(category), priority: String(priority), due: `${day}T${time}`, done: Boolean(done), reminded: new Date(`${day}T${time}`).getTime() <= Date.now() }))
}
let webTasks: Task[] | undefined
let webAlerts: Task[] = []
const listeners = new Set<(snapshot: Snapshot) => void>()
function webSnapshot() { return { tasks: webTasks!, alerts: webAlerts } }
function persist(tasks: Task[]) {
  // Keep the old web storage format so existing browser data remains compatible.
  localStorage.setItem(storageKey, JSON.stringify(tasks))
  webTasks = tasks
  for (const listener of listeners) listener(webSnapshot())
}

export const repository = {
  async load(): Promise<Snapshot> {
    if (window.littleDay) return window.littleDay.load()
    if (!webTasks) {
      const saved = localStorage.getItem(storageKey)
      persist(saved === null ? sampleTasks() : parseTasks(saved))
    }
    return webSnapshot()
  },
  async command(command: Command): Promise<Snapshot> {
    if (window.littleDay) return window.littleDay.command(command)
    const next = applyCommand(webTasks!, command)
    if (command.type === 'import') localStorage.setItem(`${storageKey}-before-import`, serializeTasks(webTasks!))
    persist(next)
    for (const listener of listeners) listener(webSnapshot())
    return webSnapshot()
  },
  subscribe(callback: (snapshot: Snapshot) => void) {
    if (window.littleDay) return window.littleDay.onChange(callback)
    listeners.add(callback)
    return () => { listeners.delete(callback) }
  },
  onError(callback: (message: string) => void) { return window.littleDay?.onError(callback) || (() => {}) },
  startReminders(onError: (message: string) => void) {
    if (isDesktop) return () => {}
    const tick = () => {
      if (!webTasks) return
      const due = dueTasks(webTasks)
      if (!due.length) return
      try {
        persist(markReminded(webTasks, due))
        webAlerts = [...due, ...webAlerts].slice(0, 200)
        for (const listener of listeners) listener(webSnapshot())
        if ('Notification' in window && Notification.permission === 'granted') for (const t of due) {
          try { new Notification('小日 · 待办提醒', { body: t.title, tag: t.id }) } catch { /* The in-app reminder remains available. */ }
        }
      } catch { onError('无法保存任务，请检查浏览器存储空间。') }
    }
    const timer = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  },
  async storageInfo(): Promise<StorageInfo> {
    if (window.littleDay) return window.littleDay.storageInfo()
    return { dataPath: '当前浏览器的本地存储（不是电脑中的 JSON 文件）', backupPath: '当前浏览器的本地存储；可用下方按钮导出上次备份', hasBackup: localStorage.getItem(`${storageKey}-before-import`) !== null }
  },
  async openDataFolder() { await window.littleDay?.openDataFolder() },
  async exportFile(backup = false) {
    if (window.littleDay) return window.littleDay.exportFile(backup)
    const saved = backup ? localStorage.getItem(`${storageKey}-before-import`) : null
    if (backup && saved === null) throw Error('还没有导入前备份。')
    const blob = new Blob([serializeTasks(backup ? parseTasks(saved!) : webTasks!)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `小日${backup ? '导入前备份' : '任务'}-${dateKey(new Date())}.json`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return '已交给浏览器下载，请在浏览器下载列表查看保存位置（通常为“下载”文件夹）。'
  },
}
