export type AppState = {
  step: 'setup' | 'flights' | 'schedule'
  className: string
  startTime: string
  arrivalTime: string
  flexible: boolean
  selected: string[]
  numFields: number
  referees: Record<string, string>
  schedule: import('./scheduler').Match[]
  fields: string[][]
  mode: 'flex_a' | 'flex_b'
  flexBSchedule: import('./scheduler').Match[]
  flexBFields: string[][]
  flexBStartTime: string
}

const KEY = 'sos-flex-pages-state-v1'

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AppState) : null
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
    schedule: [],
    fields: [],
    mode: 'flex_a',
    flexBSchedule: [],
    flexBFields: [],
    flexBStartTime: '',
  }
}
