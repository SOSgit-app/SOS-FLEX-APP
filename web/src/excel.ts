import type { Match } from './scheduler'
import {
  fieldsFromSchedule,
  flightsFromSchedule,
  formatTime12,
  parseTimeTo24,
  type ManualReferee,
} from './scheduleOps'
import * as XLSX from 'xlsx'

export type UploadedSchedule = {
  schedule: Match[]
  className: string
  startTime: string
  arrivalTime: string
  referees: Record<string, string>
  headReferees: Record<string, boolean>
  unassignedReferees: Record<string, ManualReferee>
  numFields: number
  fields: string[][]
  selected: string[]
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) {
    const h = String(v.getHours()).padStart(2, '0')
    const m = String(v.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  return String(v).trim()
}

function sheetToRows(sheet: XLSX.WorkSheet | undefined): unknown[][] {
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][]
}

function yes(v: unknown): boolean {
  return cellStr(v).toUpperCase() === 'YES'
}

function parseFieldNum(v: unknown): number {
  const s = cellStr(v)
  const cleaned = s.replace(/Field\s*/i, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export async function parseScheduleWorkbook(
  file: File,
): Promise<UploadedSchedule> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const scheduleRows = sheetToRows(wb.Sheets['Schedule'])
  if (!scheduleRows.length) throw new Error('No Schedule sheet found in file')

  let className = 'Uploaded Schedule'
  let arrivalTime = ''
  let startTime = ''

  for (let i = 0; i < Math.min(5, scheduleRows.length); i++) {
    const row = scheduleRows[i] || []
    const label = cellStr(row[0]).toLowerCase()
    const value = cellStr(row[1])
    if (label.includes('class name') && value) className = value
    if (label.includes('arrival time') && value) arrivalTime = parseTimeTo24(value)
    if (label.includes('start time') && value) startTime = parseTimeTo24(value)
  }

  let dataStart = 0
  for (let i = 0; i < scheduleRows.length; i++) {
    const c0 = cellStr(scheduleRows[i]?.[0]).toLowerCase()
    if (c0 === 'field' || c0 === 'match') {
      dataStart = i + 1
      break
    }
  }

  const schedule: Match[] = []
  for (let i = dataStart; i < scheduleRows.length; i++) {
    const row = scheduleRows[i] || []
    const c0 = cellStr(row[0])
    if (!c0 || c0.toLowerCase().startsWith('legend')) continue
    const field = Number(c0)
    const match_number = Number(row[1])
    if (!Number.isFinite(field) || !Number.isFinite(match_number)) continue
    const flight1 = cellStr(row[4])
    const flight2 = cellStr(row[5])
    if (!flight1 || !flight2) continue
    schedule.push({
      field,
      match_number,
      time: cellStr(row[2]),
      transition: cellStr(row[3]),
      flight1,
      flight2,
    })
  }

  if (!schedule.length) throw new Error('No valid schedule data found in file')

  const referees: Record<string, string> = {}
  const headReferees: Record<string, boolean> = {}
  const refereeRows = sheetToRows(wb.Sheets['Referees'])
  if (refereeRows.length > 1) {
    const headers = refereeRows[0].map((h) => cellStr(h).toLowerCase())
    const idx = {
      field: headers.findIndex((h) => h === 'field'),
      referee: headers.findIndex((h) => h === 'referee'),
      flight: headers.findIndex((h) => h === 'flight'),
      head: headers.findIndex((h) => h.includes('head')),
    }
    for (let i = 1; i < refereeRows.length; i++) {
      const row = refereeRows[i]
      const flight = cellStr(row[idx.flight >= 0 ? idx.flight : 2])
      const name = cellStr(row[idx.referee >= 0 ? idx.referee : 1])
      if (!flight || !name) continue
      referees[flight] = name
      if (yes(row[idx.head >= 0 ? idx.head : 3])) headReferees[name] = true
    }
  }

  const unassignedReferees: Record<string, ManualReferee> = {}
  const manualRows = sheetToRows(wb.Sheets['Manual Referees'])
  if (manualRows.length > 1) {
    const headers = manualRows[0].map((h) => cellStr(h).toLowerCase())
    const idx = {
      field: headers.findIndex((h) => h === 'field'),
      referee: headers.findIndex((h) => h === 'referee'),
      head: headers.findIndex((h) => h.includes('head')),
      lead: headers.findIndex((h) => h.includes('lead')),
    }
    for (let i = 1; i < manualRows.length; i++) {
      const row = manualRows[i]
      const name = cellStr(row[idx.referee >= 0 ? idx.referee : 1])
      const field = parseFieldNum(row[idx.field >= 0 ? idx.field : 0])
      if (!name || !field) continue
      const is_head = yes(row[idx.head >= 0 ? idx.head : 2])
      const is_lead = yes(row[idx.lead >= 0 ? idx.lead : 3])
      unassignedReferees[name] = { field, is_head, is_lead }
      if (is_head) headReferees[name] = true
    }
  }

  const numFields = Math.max(...schedule.map((m) => m.field), 1)
  if (!startTime) {
    const first = schedule[0].time.split(' - ')[0]
    startTime = parseTimeTo24(first) || first
  }
  if (!arrivalTime && startTime) {
    const [h, m] = startTime.split(':').map(Number)
    const d = new Date(1970, 0, 1, h, m)
    d.setMinutes(d.getMinutes() - 30)
    arrivalTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return {
    schedule,
    className,
    startTime,
    arrivalTime,
    referees,
    headReferees,
    unassignedReferees,
    numFields,
    fields: fieldsFromSchedule(schedule, numFields),
    selected: flightsFromSchedule(schedule),
  }
}

export function downloadScheduleExcel(opts: {
  schedule: Match[]
  className: string
  startTime: string
  arrivalTime: string
  referees: Record<string, string>
  headReferees?: Record<string, boolean>
  unassignedReferees?: Record<string, ManualReferee>
}): void {
  const {
    schedule,
    className,
    startTime,
    arrivalTime,
    referees,
    headReferees = {},
    unassignedReferees = {},
  } = opts

  const infoRows = [
    ['Class Name:', className],
    ['Arrival Time:', formatTime12(arrivalTime) || arrivalTime],
    ['Start Time:', formatTime12(startTime) || startTime],
    [],
    ['Field', 'Match', 'Time', 'Transition', 'Flight 1', 'Flight 2'],
  ]

  const dataRows = schedule.map((m) => [
    m.field,
    m.match_number,
    m.time,
    m.transition,
    m.flight1,
    m.flight2,
  ])

  const sheet = XLSX.utils.aoa_to_sheet([...infoRows, ...dataRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Schedule')

  const refRows: (string | number)[][] = [['Field', 'Referee', 'Flight', 'Head Referee']]
  const byField: Record<number, Set<string>> = {}
  for (const m of schedule) {
    byField[m.field] ??= new Set()
    byField[m.field].add(m.flight1)
    byField[m.field].add(m.flight2)
  }
  for (const field of Object.keys(byField)
    .map(Number)
    .sort((a, b) => a - b)) {
    for (const flight of [...byField[field]].sort()) {
      const name = referees[flight]
      if (!name) continue
      refRows.push([
        `Field ${field}`,
        name,
        flight,
        headReferees[name] ? 'Yes' : 'No',
      ])
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(refRows), 'Referees')

  const manualRows: (string | number)[][] = [
    ['Field', 'Referee', 'Head Referee', 'Lead Referee'],
  ]
  const sortedManual = Object.entries(unassignedReferees).sort(
    (a, b) => a[1].field - b[1].field,
  )
  for (const [name, data] of sortedManual) {
    manualRows.push([
      `Field ${data.field}`,
      name,
      data.is_head ? 'Yes' : 'No',
      data.is_lead ? 'Yes' : 'No',
    ])
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(manualRows), 'Manual Referees')

  const safeName = className.replace(/\s+/g, '_') || 'schedule'
  XLSX.writeFile(wb, `${safeName}_schedule.xlsx`)
}
