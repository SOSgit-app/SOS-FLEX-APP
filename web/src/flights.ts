export const SQUADRONS = {
  knights: { label: 'Knights (A)', prefix: 'A', flights: range('A', 1, 15) },
  bulls: { label: 'Bulls (B)', prefix: 'B', flights: range('B', 16, 30) },
  centurions: { label: 'Centurions (C)', prefix: 'C', flights: range('C', 31, 46) },
  tigers: { label: 'Tigers (F)', prefix: 'F', flights: range('F', 60, 75) },
} as const

function range(letter: string, start: number, end: number): string[] {
  const out: string[] = []
  for (let i = start; i <= end; i++) {
    out.push(`${letter}${String(i).padStart(2, '0')}`)
  }
  return out
}

export function squadronOf(flight: string): string {
  return flight[0] ?? ''
}
