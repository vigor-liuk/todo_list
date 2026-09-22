import type { RecommendationRecord } from './recommendation-record.mjs'
export type Task = { id: string; title: string; note: string; category: string; priority: string; due: string; done: boolean; reminded: boolean; startedAt?: string; completedAt?: string; recommendation?: RecommendationRecord }
export type Command = { type: 'upsert'; task: Task } | { type: 'delete' | 'toggle' | 'start' | 'complete'; id: string } | { type: 'import'; text: string }
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
