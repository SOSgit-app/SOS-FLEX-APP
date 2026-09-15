import { useEffect, useMemo, useState } from 'react'
import { downloadScheduleExcel } from './excel'
import { SQUADRONS } from './flights'
import { generateFlexB, generateSchedule, parseRefereeList } from './scheduler'
import { defaultState, loadState, saveState, type AppState } from './store'
import './App.css'

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? defaultState())
  const [refereeText, setRefereeText] = useState('')

  useEffect(() => {
    saveState(state)
  }, [state])

  const activeSchedule = state.mode === 'flex_b' ? state.flexBSchedule : state.schedule
  const activeFields = state.mode === 'flex_b' ? state.flexBFields : state.fields
  const activeStart = state.mode === 'flex_b' ? state.flexBStartTime || state.startTime : state.startTime
  const title =
    state.mode === 'flex_b'
      ? `${state.className || 'Schedule'} - Flex B`
      : state.className || 'Schedule'

  const fieldBlocks = useMemo(() => {
    const map = new Map<number, typeof activeSchedule>()
    for (const m of activeSchedule) {
      if (!map.has(m.field)) map.set(m.field, [])
      map.get(m.field)!.push(m)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [activeSchedule])

  const update = (patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch }))

  const onCreateSetup = (e: React.FormEvent) => {
    e.preventDefault()
    if (!state.className.trim()) return
    update({ step: 'flights' })
  }

  const toggleFlight = (flight: string) => {
    setState((s) => ({
      ...s,
      selected: s.selected.includes(flight)
        ? s.selected.filter((f) => f !== flight)
        : [...s.selected, flight],
    }))
  }

  const onGenerate = (e: React.FormEvent) => {
    e.preventDefault()
    if (state.selected.length < 2) {
      alert('Please select at least two flights.')
      return
    }
    const referees = parseRefereeList(refereeText, state.selected)
    const { schedule, fields } = generateSchedule(
      state.selected,
      state.startTime,
      state.numFields,
      state.flexible,
    )
    update({
      referees,
      schedule,
      fields,
      step: 'schedule',
      mode: 'flex_a',
      flexBSchedule: [],
      flexBFields: [],
    })
  }

  const onFlexB = () => {
    const { schedule, fields } = generateFlexB(
      state.selected,
      state.flexBStartTime || state.startTime,
      state.numFields,
      state.schedule,
    )
    update({
      flexBSchedule: schedule,
      flexBFields: fields,
      mode: 'flex_b',
      flexBStartTime: state.flexBStartTime || state.startTime,
    })
  }

  const onRegenerate = () => {
    if (state.mode === 'flex_b') {
      const { schedule, fields } = generateFlexB(
        state.selected,
        state.flexBStartTime || state.startTime,
        state.numFields,
        state.schedule,
      )
      update({ flexBSchedule: schedule, flexBFields: fields })
    } else {
      const { schedule, fields } = generateSchedule(
        state.selected,
        state.startTime,
        state.numFields,
        state.flexible,
      )
      update({ schedule, fields })
    }
  }

  return (
    <div className="app">
      <header className="brand">
        <div className="brand-title">FLEX SCHEDULING TOOL</div>
        <div className="brand-sub">GitHub Pages edition (runs fully in your browser)</div>
      </header>

      {state.step === 'setup' && (
        <form className="card" onSubmit={onCreateSetup}>
          <h1>Flex A Initial Setup</h1>
          <label>
            Class Name
            <input
              value={state.className}
              onChange={(e) => update({ className: e.target.value })}
              required
            />
          </label>
          <label>
            Start Time
            <input
              type="time"
              value={state.startTime}
              onChange={(e) => update({ startTime: e.target.value })}
              required
            />
          </label>
          <label>
            Arrival Time
            <input
              type="time"
              value={state.arrivalTime}
              onChange={(e) => update({ arrivalTime: e.target.value })}
              required
            />
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={state.flexible}
              onChange={(e) => update({ flexible: e.target.checked })}
            />
            Enable Flexible Scheduling
          </label>
          <p className="hint">
            Flexible scheduling allows same-squadron matchups when needed (e.g. fewer squadrons).
          </p>
          <button type="submit" className="primary">
            Create New Schedule
          </button>
        </form>
      )}

      {state.step === 'flights' && (
        <form className="card wide" onSubmit={onGenerate}>
          <h1>Flight Selection</h1>
          <p className="meta">
            {state.className} · start {state.startTime} · arrival {state.arrivalTime}
          </p>

          <label>
            Number of Fields
            <input
              type="number"
              min={1}
              max={16}
              value={state.numFields}
              onChange={(e) => update({ numFields: Number(e.target.value) || 8 })}
            />
          </label>

          {Object.entries(SQUADRONS).map(([key, group]) => (
            <section key={key} className={`squadron ${key}`}>
              <h2>{group.label}</h2>
              <div className="flight-grid">
                {group.flights.map((flight) => (
                  <button
                    key={flight}
                    type="button"
                    className={`flight-btn ${state.selected.includes(flight) ? 'selected' : ''}`}
                    onClick={() => toggleFlight(flight)}
                  >
                    {flight}
                  </button>
                ))}
              </div>
            </section>
          ))}

          <p className="count">Selected Flights: {state.selected.length}</p>

          <h2>Add Referees</h2>
          <p className="hint">Paste or type: Flight, then space/tab, then instructor name</p>
          <textarea
            rows={8}
            value={refereeText}
            onChange={(e) => setRefereeText(e.target.value)}
            placeholder={'A08 Maj William Hashman\nB17 Maj Raquel Lewis'}
          />

          <div className="actions">
            <button type="button" className="secondary" onClick={() => update({ step: 'setup' })}>
              Back
            </button>
            <button type="submit" className="primary">
              Continue
            </button>
          </div>
        </form>
      )}

      {state.step === 'schedule' && (
        <div className="card wide">
          <h1>{title}</h1>
          <p className="meta">
            Arrival {state.arrivalTime} · Start {activeStart}
          </p>

          <div className="actions wrap">
            <button type="button" className="secondary" onClick={() => update({ step: 'flights' })}>
              Edit Flights
            </button>
            <button type="button" className="secondary" onClick={onRegenerate}>
              Regenerate
            </button>
            {state.mode === 'flex_a' ? (
              <button type="button" className="primary" onClick={onFlexB}>
                Generate Flex B
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={() => update({ mode: 'flex_a' })}
              >
                View Flex A
              </button>
            )}
            <button
              type="button"
              className="gold"
              onClick={() =>
                downloadScheduleExcel({
                  schedule: activeSchedule,
                  className: title,
                  startTime: activeStart,
                  arrivalTime: state.arrivalTime,
                  referees: state.referees,
                })
              }
            >
              Download Excel
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                localStorage.removeItem('sos-flex-pages-state-v1')
                setState(defaultState())
                setRefereeText('')
              }}
            >
              Start Over
            </button>
          </div>

          <div className="field-assign">
            <h2>Field Assignments</h2>
            <div className="assign-grid">
              {activeFields.map((flights, i) => (
                <div key={i} className="assign-card">
                  <strong>Field {i + 1}</strong>
                  <span>{flights.join(', ') || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {fieldBlocks.map(([field, matches]) => (
            <section key={field} className="field-block">
              <h2>Field {field}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Time</th>
                    <th>Transition</th>
                    <th>Flight 1</th>
                    <th>Flight 2</th>
                    <th>Referees</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={`${m.field}-${m.match_number}`}>
                      <td>{m.match_number}</td>
                      <td>{m.time}</td>
                      <td>{m.transition}</td>
                      <td className={`sq-${m.flight1[0]}`}>{m.flight1}</td>
                      <td className={`sq-${m.flight2[0]}`}>{m.flight2}</td>
                      <td>
                        {[state.referees[m.flight1], state.referees[m.flight2]]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
