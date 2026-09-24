import type { Match } from './scheduler'

export type ManualReferee = {
  field: number
  is_head: boolean
  is_lead: boolean
}

export function fieldsFromSchedule(schedule: Match[], numFields: number): string[][] {
  const n = Math.max(numFields, ...schedule.map((m) => m.field), 1)
  const fields: string[][] = Array.from({ length: n }, () => [])
  for (const m of schedule) {
    const i = m.field - 1
    if (i < 0 || i >= fields.length) continue
    if (m.flight1 && !fields[i].includes(m.flight1)) fields[i].push(m.flight1)
    if (m.flight2 && !fields[i].includes(m.flight2)) fields[i].push(m.flight2)
  }
  return fields
}

export function flightsFromSchedule(schedule: Match[]): string[] {
  const set = new Set<string>()
  for (const m of schedule) {
    if (m.flight1) set.add(m.flight1)
    if (m.flight2) set.add(m.flight2)
  }
  return [...set].sort()
}

function parseHHMM(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(1970, 0, 1, h || 0, m || 0, 0, 0)
}

function fmt(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Rebuild game/transition times for one field from a start HH:MM (20+10 min slots). */
export function retimedFieldSchedule(
  schedule: Match[],
  field: number,
  startTime: string,
): Match[] {
  let current = parseHHMM(startTime)
  const fieldMatches = schedule
    .filter((m) => m.field === field)
    .sort((a, b) => a.match_number - b.match_number)

  const updated = fieldMatches.map((m, index) => {
    const gameEnd = new Date(current.getTime() + 20 * 60_000)
    const transitionEnd = new Date(gameEnd.getTime() + 10 * 60_000)
    const next: Match = {
      ...m,
      match_number: index + 1,
      time: `${fmt(current)} - ${fmt(gameEnd)}`,
      transition: `${fmt(gameEnd)} - ${fmt(transitionEnd)}`,
    }
    current = transitionEnd
    return next
  })

  const others = schedule.filter((m) => m.field !== field)
  return [...others, ...updated].sort(
    (a, b) => a.field - b.field || a.match_number - b.match_number,
  )
}

export function formatTime12(hhmm: string): string {
  if (!hhmm) return ''
  try {
    const [hStr, m] = hhmm.split(':')
    let h = Number(hStr)
    const suffix = h >= 12 ? 'PM' : 'AM'
    h = h % 12
    if (h === 0) h = 12
    return `${String(h).padStart(2, '0')}:${m} ${suffix}`
  } catch {
    return hhmm
  }
}

export function parseTimeTo24(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/AM|PM/i.test(raw)) {
    const parts = raw.split(/\s+/)
    if (parts.length >= 2) {
      const [timePart, meridianRaw] = parts
      const meridian = meridianRaw.toUpperCase()
      try {
        let [hour, minute] = timePart.split(':').map(Number)
        if (meridian === 'PM' && hour < 12) hour += 12
        if (meridian === 'AM' && hour === 12) hour = 0
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      } catch {
        return timePart
      }
    }
  }
  const m = raw.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  return raw
}

export function reorderFieldMatches(
  schedule: Match[],
  field: number,
  fromIndex: number,
  toIndex: number,
): Match[] {
  const fieldMatches = schedule
    .filter((m) => m.field === field)
    .sort((a, b) => a.match_number - b.match_number)
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= fieldMatches.length ||
    toIndex >= fieldMatches.length ||
    fromIndex === toIndex
  ) {
    return schedule
  }
  const [moved] = fieldMatches.splice(fromIndex, 1)
  fieldMatches.splice(toIndex, 0, moved)
  const renumbered = fieldMatches.map((m, i) => ({ ...m, match_number: i + 1 }))
  const others = schedule.filter((m) => m.field !== field)
  return [...others, ...renumbered].sort(
    (a, b) => a.field - b.field || a.match_number - b.match_number,
  )
}
