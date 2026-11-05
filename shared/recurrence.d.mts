import type { Task, Recurrence, OccurrenceState } from './tasks.mjs'
export type ReviewTask = Task & { historyKey?: number; archivedAt?: number }
export function recurrenceDays(rule: Recurrence): number[]
export function occurrenceDate(rule: Recurrence, day: string): string | undefined
export function occurrenceState(task: Task): OccurrenceState
export function hasOccurrenceRecord(state?: OccurrenceState): boolean
export function projectTask(task: Task, day?: string, includeRunning?: boolean): Task
export function projectOccurrence(task: Task, day?: string): Task
export function reviewOccurrences(tasks: Task[], day: string): ReviewTask[]
export function recurrenceLabel(task: Task): string
