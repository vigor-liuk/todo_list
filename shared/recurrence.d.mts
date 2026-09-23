import type { Task, Recurrence, OccurrenceState } from './tasks.mjs'
export function occurrenceDate(rule: Recurrence, day: string): string
export function occurrenceState(task: Task): OccurrenceState
export function projectTask(task: Task, day?: string): Task
export function projectOccurrence(task: Task, day: string): Task
export function reviewOccurrences(tasks: Task[], day: string): Task[]
export function recurrenceLabel(task: Task): string
