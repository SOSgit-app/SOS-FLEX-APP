import { squadronOf } from './flights'

export type Match = {
  field: number
  match_number: number
  time: string
  transition: string
  flight1: string
  flight2: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function parseTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function fmt(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000)
}

function assignFields(
  selected: string[],
  numFields: number,
  flexible: boolean,
  customFields?: string[][],
): string[][] {
  if (customFields) return customFields.map((f) => [...f])

  const fields: string[][] = Array.from({ length: numFields }, () => [])

  if (flexible) {
    const all = shuffle(selected)
    all.forEach((flight, i) => fields[i % numFields].push(flight))
    return fields
  }

  const groups = [
    selected.filter((f) => f.startsWith('A')),
    selected.filter((f) => f.startsWith('B')),
    selected.filter((f) => f.startsWith('C')),
    selected.filter((f) => f.startsWith('F')),
  ]

  let fieldIdx = 0
  for (const squadron of groups) {
    if (!squadron.length) continue
    const flights = shuffle(squadron)
    while (flights.length && fieldIdx < numFields) {
      fields[fieldIdx].push(flights.pop()!)
      fieldIdx = (fieldIdx + 1) % numFields
    }
  }

  const remaining = selected.filter((f) => !fields.some((field) => field.includes(f)))
  for (const flight of shuffle(remaining)) {
    const valid: [number, number][] = []
    for (let i = 0; i < numFields; i++) {
      const squadrons = new Set(fields[i].map(squadronOf))
      if (!squadrons.has(squadronOf(flight))) valid.push([i, fields[i].length])
    }
    const idx = valid.length
      ? valid.sort((a, b) => a[1] - b[1])[0][0]
      : fields.reduce((best, _, i) => (fields[i].length < fields[best].length ? i : best), 0)
    fields[idx].push(flight)
  }

  return fields
}

function patternMatches(flights: string[]): [string, string][] {
  const sorted = [...flights].sort()
  const n = sorted.length
  if (n === 4) {
    return [
      [sorted[0], sorted[1]],
      [sorted[2], sorted[3]],
      [sorted[0], sorted[2]],
      [sorted[1], sorted[3]],
    ]
  }
  if (n === 5) {
    return [
      [sorted[0], sorted[1]],
      [sorted[2], sorted[3]],
      [sorted[4], sorted[0]],
      [sorted[1], sorted[2]],
      [sorted[3], sorted[4]],
    ]
  }
  return []
}

function scheduleField(
  fieldNum: number,
  fieldFlights: string[],
  startTime: string,
  flexible: boolean,
): Match[] {
  if (fieldFlights.length < 2) return []

  const schedule: Match[] = []
  let current = parseTime(startTime)
  let matchNumber = 1

  const pushMatch = (f1: string, f2: string) => {
    const gameEnd = addMinutes(current, 20)
    const transitionEnd = addMinutes(gameEnd, 10)
    schedule.push({
      field: fieldNum,
      match_number: matchNumber++,
      time: `${fmt(current)} - ${fmt(gameEnd)}`,
      transition: `${fmt(gameEnd)} - ${fmt(transitionEnd)}`,
      flight1: f1,
      flight2: f2,
    })
    current = transitionEnd
  }

  if (flexible && fieldFlights.length >= 4 && fieldFlights.length <= 5) {
    for (const [a, b] of patternMatches(fieldFlights)) pushMatch(a, b)
    return schedule
  }

  const gamesPlayed: Record<string, number> = Object.fromEntries(fieldFlights.map((f) => [f, 0]))
  const playedAgainst: Record<string, Set<string>> = Object.fromEntries(
    fieldFlights.map((f) => [f, new Set<string>()]),
  )

  const tryPair = (a: string, b: string, last: Set<string>) => {
    if (a === b) return false
    if (last.has(a) || last.has(b)) return false
    if (playedAgainst[a].has(b)) return false
    if (!flexible && squadronOf(a) === squadronOf(b)) return false
    if (flexible && squadronOf(a) === squadronOf(b)) {
      // allow same-squadron only when flexible, but still prefer different
    }
    if (gamesPlayed[a] >= 2 || gamesPlayed[b] >= 2) return false
    return true
  }

  // Backtracking with a step limit so UI stays responsive
  let steps = 0
  const MAX_STEPS = 50_000

  const backtrack = (): boolean => {
    if (steps++ > MAX_STEPS) return false
    if (Object.values(gamesPlayed).every((g) => g === 2)) return true

    const last = schedule.length
      ? new Set([schedule[schedule.length - 1].flight1, schedule[schedule.length - 1].flight2])
      : new Set<string>()

    const byNeed = [...fieldFlights].sort((a, b) => gamesPlayed[a] - gamesPlayed[b])
    for (let i = 0; i < byNeed.length; i++) {
      for (let j = i + 1; j < byNeed.length; j++) {
        const a = byNeed[i]
        const b = byNeed[j]
        if (!tryPair(a, b, last)) continue
        if (flexible && squadronOf(a) === squadronOf(b)) {
          // Prefer cross-squadron first; skip same-squadron until later pass
          continue
        }

        gamesPlayed[a]++
        gamesPlayed[b]++
        playedAgainst[a].add(b)
        playedAgainst[b].add(a)
        pushMatch(a, b)

        if (backtrack()) return true

        schedule.pop()
        matchNumber--
        current = addMinutes(current, -30)
        gamesPlayed[a]--
        gamesPlayed[b]--
        playedAgainst[a].delete(b)
        playedAgainst[b].delete(a)
      }
    }

    // Fallback: allow same squadron when flexible
    if (flexible) {
      for (let i = 0; i < byNeed.length; i++) {
        for (let j = i + 1; j < byNeed.length; j++) {
          const a = byNeed[i]
          const b = byNeed[j]
          if (!tryPair(a, b, last)) continue

          gamesPlayed[a]++
          gamesPlayed[b]++
          playedAgainst[a].add(b)
          playedAgainst[b].add(a)
          pushMatch(a, b)

          if (backtrack()) return true

          schedule.pop()
          matchNumber--
          current = addMinutes(current, -30)
          gamesPlayed[a]--
          gamesPlayed[b]--
          playedAgainst[a].delete(b)
          playedAgainst[b].delete(a)
        }
      }
    }

    return false
  }

  if (!backtrack()) {
    // Greedy fallback so we always produce something usable
    const pool = shuffle(fieldFlights)
    const last = new Set<string>()
    while (Object.values(gamesPlayed).some((g) => g < 2)) {
      let placed = false
      for (let i = 0; i < pool.length && !placed; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const a = pool[i]
          const b = pool[j]
          if (gamesPlayed[a] >= 2 || gamesPlayed[b] >= 2) continue
          if (last.has(a) || last.has(b)) continue
          if (playedAgainst[a].has(b)) continue
          if (!flexible && squadronOf(a) === squadronOf(b)) continue

          gamesPlayed[a]++
          gamesPlayed[b]++
          playedAgainst[a].add(b)
          playedAgainst[b].add(a)
          pushMatch(a, b)
          last.clear()
          last.add(a)
          last.add(b)
          placed = true
          break
        }
      }
      if (!placed) break
    }
  }

  return schedule
}

export function generateSchedule(
  selected: string[],
  startTime: string,
  numFields: number,
  flexible = false,
  customFields?: string[][],
): { schedule: Match[]; fields: string[][] } {
  if (selected.length < 2) return { schedule: [], fields: [] }

  const fields = assignFields(selected, numFields, flexible, customFields)
  const schedule: Match[] = []

  fields.forEach((flights, idx) => {
    schedule.push(...scheduleField(idx + 1, flights, startTime, flexible))
  })

  schedule.sort((a, b) => a.field - b.field || a.match_number - b.match_number)
  return { schedule, fields }
}

export function generateFlexB(
  selected: string[],
  startTime: string,
  numFields: number,
  flexASchedule: Match[],
): { schedule: Match[]; fields: string[][] } {
  const flexAField: Record<string, number> = {}
  for (const m of flexASchedule) {
    flexAField[m.flight1] = m.field
    flexAField[m.flight2] = m.field
  }

  const fields: string[][] = Array.from({ length: numFields }, () => [])
  for (const flight of shuffle(selected)) {
    const avoid = (flexAField[flight] ?? 1) - 1
    const possible = shuffle([...Array(numFields).keys()].filter((i) => i !== avoid))
    let placed = false
    for (const i of possible) {
      const squadrons = new Set(fields[i].map(squadronOf))
      if (!squadrons.has(squadronOf(flight))) {
        fields[i].push(flight)
        placed = true
        break
      }
    }
    if (!placed) {
      const i = possible.sort((a, b) => fields[a].length - fields[b].length)[0]
      fields[i].push(flight)
    }
  }

  return generateSchedule(selected, startTime, numFields, true, fields)
}

/** Accept tab OR spaces: "A08 Maj Name" */
export function parseRefereeList(text: string, selected: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /^([A-Za-z]\d+)\s+(.+)$/
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(re)
    if (!m) continue
    const flight = m[1]
    const name = m[2].trim()
    if (selected.includes(flight)) out[flight] = name
  }
  return out
}
