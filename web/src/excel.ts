import ExcelJS from 'exceljs'
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

const FIELD_COLORS = [
  'F0F7FF',
  'FFF0F0',
  'F0FFF0',
  'FFF7F0',
  'F0F0FF',
  'FFFFF0',
  'FFF0FF',
  'F0FFFF',
]

function squadronStyle(flight: string): { fill: string; font: string } {
  if (flight.startsWith('A')) return { fill: 'FFFFFF', font: 'FF0000' }
  if (flight.startsWith('B')) return { fill: '4B0F0F', font: 'FFA500' }
  if (flight.startsWith('C')) return { fill: '228B22', font: 'FFFF00' }
  if (flight.startsWith('F')) return { fill: 'E65100', font: '000000' }
  return { fill: 'FFFFFF', font: '000000' }
}

function fillStyle(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } }
}

function borderThin(): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } }
  return { top: edge, left: edge, bottom: edge, right: edge }
}

/** Excel export styled to match Flask/xlsxwriter download_schedule output. */
export async function downloadScheduleExcel(opts: {
  schedule: Match[]
  className: string
  startTime: string
  arrivalTime: string
  referees: Record<string, string>
  headReferees?: Record<string, boolean>
  unassignedReferees?: Record<string, ManualReferee>
}): Promise<void> {
  const {
    schedule,
    className,
    startTime,
    arrivalTime,
    referees,
    headReferees = {},
    unassignedReferees = {},
  } = opts

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Schedule')
  ws.getColumn(1).width = 20
  ws.getColumn(2).width = 20
  ws.getColumn(3).width = 20
  ws.getColumn(4).width = 20
  ws.getColumn(5).width = 12
  ws.getColumn(6).width = 12

  const infoHeader = {
    bold: true,
    fill: fillStyle('AF9B62'),
    font: { bold: true, color: { argb: 'FF1A2F5A' } },
    alignment: { horizontal: 'left' as const },
    border: borderThin(),
  }
  const infoValue = {
    fill: fillStyle('FFFFFF'),
    font: { color: { argb: 'FF000000' } },
    alignment: { horizontal: 'left' as const },
    border: borderThin(),
  }
  const header = {
    bold: true,
    fill: fillStyle('4A4A4A'),
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    alignment: { horizontal: 'center' as const },
    border: borderThin(),
  }

  const writeInfo = (row: number, label: string, value: string) => {
    const a = ws.getCell(row, 1)
    a.value = label
    a.fill = infoHeader.fill
    a.font = infoHeader.font
    a.alignment = infoHeader.alignment
    a.border = infoHeader.border

    const b = ws.getCell(row, 2)
    b.value = value
    b.fill = infoValue.fill
    b.font = infoValue.font
    b.alignment = infoValue.alignment
    b.border = infoValue.border
  }

  writeInfo(1, 'Class Name:', className)
  writeInfo(2, 'Arrival Time:', formatTime12(arrivalTime) || arrivalTime)
  writeInfo(3, 'Start Time:', formatTime12(startTime) || startTime)

  for (let col = 1; col <= 6; col++) {
    const cell = ws.getCell(4, col)
    cell.value = ''
    cell.fill = fillStyle('E0E0E0')
  }

  const headers = ['Field', 'Match', 'Time', 'Transition', 'Flight 1', 'Flight 2']
  headers.forEach((h, i) => {
    const cell = ws.getCell(5, i + 1)
    cell.value = h
    cell.fill = header.fill
    cell.font = header.font
    cell.alignment = header.alignment
    cell.border = header.border
  })

  const sorted = [...schedule].sort(
    (a, b) => a.field - b.field || a.match_number - b.match_number,
  )

  let row = 6
  for (const match of sorted) {
    const fieldColor = FIELD_COLORS[(match.field - 1) % FIELD_COLORS.length]
    const fieldFill = fillStyle(fieldColor)
    const center = { horizontal: 'center' as const }

    for (let col = 1; col <= 4; col++) {
      const cell = ws.getCell(row, col)
      cell.fill = fieldFill
      cell.alignment = center
      cell.border = borderThin()
    }
    ws.getCell(row, 1).value = match.field
    ws.getCell(row, 2).value = match.match_number
    ws.getCell(row, 3).value = match.time
    ws.getCell(row, 4).value = match.transition

    for (const [col, flight] of [
      [5, match.flight1],
      [6, match.flight2],
    ] as const) {
      const style = squadronStyle(flight)
      const cell = ws.getCell(row, col)
      cell.value = flight
      cell.fill = fillStyle(style.fill)
      cell.font = { color: { argb: `FF${style.font}` }, bold: true }
      cell.alignment = center
      cell.border = borderThin()
    }
    row += 1
  }

  const legendRow = row + 1
  const boldFont = { bold: true }
  ws.getCell(legendRow, 1).value = 'Legend:'
  ws.getCell(legendRow, 1).font = boldFont

  ws.getCell(legendRow + 1, 1).value = 'Squadrons:'
  ws.getCell(legendRow + 1, 1).font = boldFont

  const squadronLegend: [string, string, string][] = [
    ['Knights (A)', 'FFFFFF', 'FF0000'],
    ['Bulls (B)', '4B0F0F', 'FFA500'],
    ['Centurions (C)', '228B22', 'FFFF00'],
    ['Tigers (F)', 'E65100', '000000'],
  ]
  squadronLegend.forEach(([label, fill, font], i) => {
    const cell = ws.getCell(legendRow + 1, i + 2)
    cell.value = label
    cell.fill = fillStyle(fill)
    cell.font = { color: { argb: `FF${font}` }, bold: true }
    cell.alignment = { horizontal: 'center' }
    cell.border = borderThin()
  })

  ws.getCell(legendRow + 2, 1).value = 'Fields:'
  ws.getCell(legendRow + 2, 1).font = boldFont
  FIELD_COLORS.forEach((color, i) => {
    const cell = ws.getCell(legendRow + 2, i + 2)
    cell.value = `Field ${i + 1}`
    cell.fill = fillStyle(color)
    cell.alignment = { horizontal: 'center' }
    cell.border = borderThin()
  })

  // Referees sheet
  const refSheet = wb.addWorksheet('Referees')
  refSheet.getColumn(1).width = 15
  refSheet.getColumn(2).width = 40
  refSheet.getColumn(3).width = 15
  refSheet.getColumn(4).width = 15

  const refHeader = {
    fill: fillStyle('1A2F5A'),
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    alignment: { horizontal: 'center' as const },
    border: borderThin(),
  }
  const refEntry = {
    fill: fillStyle('F5F5F5'),
    font: { color: { argb: 'FF000000' } },
    alignment: { horizontal: 'left' as const },
    border: borderThin(),
  }
  const headEntry = {
    fill: fillStyle('AF9B62'),
    font: { bold: true, color: { argb: 'FF1A2F5A' } },
    alignment: { horizontal: 'left' as const },
    border: borderThin(),
  }

  ;['Field', 'Referee', 'Flight', 'Head Referee'].forEach((h, i) => {
    const cell = refSheet.getCell(1, i + 1)
    cell.value = h
    cell.fill = refHeader.fill
    cell.font = refHeader.font
    cell.alignment = refHeader.alignment
    cell.border = refHeader.border
  })

  const byField: Record<number, Set<string>> = {}
  for (const m of schedule) {
    byField[m.field] ??= new Set()
    byField[m.field].add(m.flight1)
    byField[m.field].add(m.flight2)
  }

  let refRow = 2
  for (const field of Object.keys(byField)
    .map(Number)
    .sort((a, b) => a - b)) {
    for (const flight of [...byField[field]].sort()) {
      const name = referees[flight]
      if (!name) continue
      const isHead = Boolean(headReferees[name])
      const style = isHead ? headEntry : refEntry
      const values = [`Field ${field}`, name, flight, isHead ? 'Yes' : 'No']
      values.forEach((v, i) => {
        const cell = refSheet.getCell(refRow, i + 1)
        cell.value = v
        cell.fill = style.fill
        cell.font = style.font
        cell.alignment = style.alignment
        cell.border = style.border
      })
      refRow += 1
    }
  }

  // Manual Referees sheet
  const manualSheet = wb.addWorksheet('Manual Referees')
  manualSheet.getColumn(1).width = 15
  manualSheet.getColumn(2).width = 40
  manualSheet.getColumn(3).width = 15
  manualSheet.getColumn(4).width = 15

  ;['Field', 'Referee', 'Head Referee', 'Lead Referee'].forEach((h, i) => {
    const cell = manualSheet.getCell(1, i + 1)
    cell.value = h
    cell.fill = refHeader.fill
    cell.font = refHeader.font
    cell.alignment = refHeader.alignment
    cell.border = refHeader.border
  })

  const sortedManual = Object.entries(unassignedReferees).sort(
    (a, b) => a[1].field - b[1].field,
  )
  let manRow = 2
  for (const [name, data] of sortedManual) {
    const isHead = Boolean(data.is_head || headReferees[name])
    const style = isHead ? headEntry : refEntry
    const values = [
      `Field ${data.field}`,
      name,
      isHead ? 'Yes' : 'No',
      data.is_lead ? 'Yes' : 'No',
    ]
    values.forEach((v, i) => {
      const cell = manualSheet.getCell(manRow, i + 1)
      cell.value = v
      cell.fill = style.fill
      cell.font = style.font
      cell.alignment = style.alignment
      cell.border = style.border
    })
    manRow += 1
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(className || 'schedule').replace(/\s+/g, '_')}_schedule.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
