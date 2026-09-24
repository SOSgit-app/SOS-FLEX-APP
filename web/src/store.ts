import type { Match } from './scheduler'
import type { ManualReferee } from './scheduleOps'

export type AppState = {
  step: 'setup' | 'flights' | 'schedule'
  className: string
  startTime: string
  arrivalTime: string
  flexible: boolean
  selected: string[]
  numFields: number
  referees: Record<string, string>
  /** Keys are referee names marked as head refs */
  headReferees: Record<string, boolean>
  /** Manually added (unassigned-to-flight) referees by name */
  unassignedReferees: Record<string, ManualReferee>
  schedule: Match[]
  fields: string[][]
  mode: 'flex_a' | 'flex_b'
  flexBSchedule: Match[]
  flexBFields: string[][]
  flexBStartTime: string
}

const KEY = 'sos-flex-pages-state-v2'

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('sos-flex-pages-state-v1')
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppState>
    return { ...defaultState(), ...parsed, headReferees: parsed.headReferees ?? {}, unassignedReferees: parsed.unassignedReferees ?? {} }
  } catch {
    return null
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function defaultState(): AppState {
  return {
    step: 'setup',
    className: '',
    startTime: '08:00',
    arrivalTime: '07:30',
    flexible: false,
    selected: [],
    numFields: 8,
    referees: {},
    headReferees: {},
    unassignedReferees: {},
    schedule: [],
    fields: [],
    mode: 'flex_a',
    flexBSchedule: [],
    flexBFields: [],
    flexBStartTime: '',
  }
}
