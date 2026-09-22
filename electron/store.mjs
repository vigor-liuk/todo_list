import { mkdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { applyCommand, parseTasks, serializeTasks, dueTasks, markReminded, maxBytes } from '../shared/tasks.mjs'

export function atomicWrite(file, text) {
  const temp = `${file}.${process.pid}.tmp`
  let fd
  try {
    fd = openSync(temp, 'w', 0o600)
    writeFileSync(fd, text, 'utf8')
    fsyncSync(fd)
    closeSync(fd); fd = undefined
    renameSync(temp, file)
  } finally {
    if (fd !== undefined) closeSync(fd)
    try { unlinkSync(temp) } catch { /* Renamed or never created. */ }
  }
}

export class TaskStore {
  constructor(directory) {
    mkdirSync(directory, { recursive: true })
    this.file = join(directory, 'tasks.json')
    this.alerts = []
    try {
      if (statSync(this.file).size > maxBytes) throw Error('任务文件超过 10 MB。')
      this.tasks = parseTasks(readFileSync(this.file, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      this.tasks = []
      this.commit([])
    }
  }
  snapshot() { return { tasks: this.tasks, alerts: this.alerts } }
  commit(tasks) {
    atomicWrite(this.file, serializeTasks(tasks))
    this.tasks = tasks
  }
  command(command) {
    const next = applyCommand(this.tasks, command)
    if (command.type === 'import') atomicWrite(`${this.file}.before-import.bak`, serializeTasks(this.tasks))
    this.commit(next)
    return this.snapshot()
  }
  tick(now = Date.now()) {
    const due = dueTasks(this.tasks, now)
    if (due.length) {
      // Commit before delivery: restarting must never send the same reminder twice.
      this.commit(markReminded(this.tasks, due))
      this.alerts = [...due, ...this.alerts].slice(0, 200)
    }
    return due
  }
}
