import { useCallback, useEffect, useRef, useState } from 'react'
import { repository } from './taskRepository'
import type { Command, Snapshot, Task } from '../shared/tasks.mjs'

export function useTasks(notify: (message: string) => void) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [alerts, setAlerts] = useState<Task[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const lastAlert = useRef<Task | undefined>(undefined)
  useEffect(() => {
    let active = true
    let revision = 0
    const accept = (snapshot: Snapshot) => {
      if (!active) return
      setTasks(snapshot.tasks); setAlerts(snapshot.alerts)
      const latest = snapshot.alerts[0]
      if (latest && (lastAlert.current?.id !== latest.id || lastAlert.current?.due !== latest.due)) notify(`到时间了：${latest.title}`)
      lastAlert.current = latest
    }
    const unsubscribe = repository.subscribe(snapshot => { revision++; accept(snapshot) })
    const unsubscribeError = repository.onError(notify)
    repository.load().then(snapshot => {
      if (!active) return
      if (revision === 0) accept(snapshot)
      setReady(true)
    }).catch(e => { if (active) setError(`无法读取任务，原数据未覆盖。${e.message}`) })
    const stop = repository.startReminders(notify)
    return () => { active = false; unsubscribe(); unsubscribeError(); stop() }
  }, [notify])
  const command = useCallback(async (value: Command) => {
    try { await repository.command(value); return true } catch (e) {
      notify(`保存失败，现有数据未替换。${e instanceof Error ? e.message : ''}`); return false
    }
  }, [notify])
  return { tasks, alerts, ready, error, command }
}
