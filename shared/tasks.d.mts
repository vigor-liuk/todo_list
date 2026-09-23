import type { RecommendationRecord } from './recommendation-record.mjs'
export type OccurrenceState = { done: boolean; reminded: boolean; startedAt?: string; completedAt?: string }
export type Recurrence = { frequency: 'daily' | 'weekly' | 'monthly'; start: string; time: string; minutes?: number; records: Record<string, OccurrenceState> }
export type Task = { id: string; title: string; note: string; category: string; priority: string; due: string; done: boolean; reminded: boolean; startedAt?: string; completedAt?: string; recommendation?: RecommendationRecord; recurrence?: Recurrence }
export type Command = { type: 'upsert'; task: Task } | { type: 'delete' | 'toggle' | 'start' | 'complete'; id: string; due?: string } | { type: 'import'; text: string }
export type Snapshot = { tasks: Task[]; alerts: Task[] }
export const storageKey: string
export const maxBytes: number
export const categories: string[]
export function validateTasks(value: unknown): Task[]
export function parseTasks(text: string): Task[]
export function serializeTasks(tasks: Task[]): string
export function applyCommand(tasks: Task[], command: Command, now?: number): Task[]
export function dueTasks(tasks: Task[], now?: number): Task[]
export function markReminded(tasks: Task[], due: Task[]): Task[]
