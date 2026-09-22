export type Series = 'run' | 'read' | 'tidy' | 'create' | 'connect' | 'reflect'
export type Plan = { title: string; note: string; minutes: number; goal: number | null }
export type RecommendationRecord = { candidateId: string; date: string; acceptedAt: string; area: string; series: Series | ''; trackProgress: boolean; goal: number | null; minutes: number; original: Plan; accepted: Plan; changes: (Plan & { at: string })[]; completedDate: string }
export const seriesSpecs: Record<Series, { area: string; unit: string; initial: number; step: number; limit: number; max: number; label: string }>
export function goalTitle(series: Series, goal: number): string
export function validGoal(series: unknown, goal: unknown): boolean
export function validateRecord(value: unknown): RecommendationRecord
export function localDate(now?: Date): string
