import type { Match } from './scheduler'
import * as XLSX from 'xlsx'

export function downloadScheduleExcel(opts: {
  schedule: Match[]
  className: string
  startTime: string
  arrivalTime: string
  referees: Record<string, string>
}): void {
  const { schedule, className, startTime, arrivalTime, referees } = opts

  const infoRows = [
    ['Class Name:', className],
    ['Arrival Time:', arrivalTime],
    ['Start Time:', startTime],
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

  const refRows: (string | number)[][] = [['Field', 'Referee', 'Flight']]
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
      if (referees[flight]) {
        refRows.push([`Field ${field}`, referees[flight], flight])
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(refRows), 'Referees')

  const safeName = className.replace(/\s+/g, '_') || 'schedule'
  XLSX.writeFile(wb, `${safeName}_schedule.xlsx`)
}
