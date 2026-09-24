import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadScheduleExcel, parseScheduleWorkbook } from './excel'
import { SQUADRONS } from './flights'
import { generateFlexB, generateSchedule, parseRefereeList, type Match } from './scheduler'
import {
  fieldsFromSchedule,
  formatTime12,
  reorderFieldMatches,
  retimedFieldSchedule,
} from './scheduleOps'
import { defaultState, loadState, saveState, type AppState } from './store'
import './App.css'

function sqClass(flight: string): string {
  const s = flight?.[0]
  return s === 'A' || s === 'B' || s === 'C' || s === 'F' ? `sq-${s}` : ''
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? defaultState())
  const [refereeText, setRefereeText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [uploadTypeOpen, setUploadTypeOpen] = useState(false)
  const [pendingUploadType, setPendingUploadType] = useState<'flex_a' | 'flex_b'>('flex_a')
  const [addRefField, setAddRefField] = useState<number | null>(null)
  const [newRefName, setNewRefName] = useState('')
  const [newRefHead, setNewRefHead] = useState(false)
  const [newRefLead, setNewRefLead] = useState(false)
  const [draftArrival, setDraftArrival] = useState(state.arrivalTime)
  const [draftStart, setDraftStart] = useState(state.startTime)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ field: number; index: number } | null>(null)

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    if (state.mode === 'flex_b') setDraftStart(state.flexBStartTime || state.startTime)
    else setDraftStart(state.startTime)
    setDraftArrival(state.arrivalTime)
  }, [state.mode, state.startTime, state.flexBStartTime, state.arrivalTime])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const activeSchedule = state.mode === 'flex_b' ? state.flexBSchedule : state.schedule
  const activeFields = state.mode === 'flex_b' ? state.flexBFields : state.fields
  const activeStart = state.mode === 'flex_b' ? state.flexBStartTime || state.startTime : state.startTime
  const title =
    state.mode === 'flex_b'
      ? `${state.className || 'Schedule'} - Flex B`
      : state.className || 'Schedule'

  const fieldBlocks = useMemo(() => {
    const map = new Map<number, Match[]>()
    for (const m of activeSchedule) {
      if (!map.has(m.field)) map.set(m.field, [])
      map.get(m.field)!.push(m)
    }
    for (const [, list] of map) list.sort((a, b) => a.match_number - b.match_number)
    // Ensure empty fields still show when we have field assignments
    const maxField = Math.max(state.numFields, ...activeSchedule.map((m) => m.field), 0)
    for (let i = 1; i <= maxField; i++) {
      if (!map.has(i)) map.set(i, [])
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [activeSchedule, state.numFields])

  const update = (patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch }))

  const setActiveSchedule = (schedule: Match[], alsoFields = true) => {
    setState((s) => {
      const fields = alsoFields ? fieldsFromSchedule(schedule, s.numFields) : undefined
      if (s.mode === 'flex_b') {
        return {
          ...s,
          flexBSchedule: schedule,
          ...(fields ? { flexBFields: fields } : {}),
        }
      }
      return {
        ...s,
        schedule,
        ...(fields ? { fields } : {}),
        selected: alsoFields
          ? [...new Set(schedule.flatMap((m) => [m.flight1, m.flight2]))].sort()
          : s.selected,
      }
    })
  }

  const notify = (msg: string) => setToast(msg)

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
      unassignedReferees: {},
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
      unassignedReferees: {},
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
    notify('Schedule regenerated')
  }

  const applyUploaded = async (file: File, type: 'flex_a' | 'flex_b') => {
    try {
      const parsed = await parseScheduleWorkbook(file)
      if (type === 'flex_b') {
        setState((s) => ({
          ...s,
          ...parsed,
          className: parsed.className.replace(/\s*-?\s*Flex B$/i, '') || parsed.className,
          flexBSchedule: parsed.schedule,
          flexBFields: parsed.fields,
          flexBStartTime: parsed.startTime,
          mode: 'flex_b',
          step: 'schedule',
          // keep any existing Flex A if present
          schedule: s.schedule.length ? s.schedule : parsed.schedule,
          fields: s.fields.length ? s.fields : parsed.fields,
        }))
      } else {
        setState((s) => ({
          ...defaultState(),
          ...parsed,
          mode: 'flex_a',
          step: 'schedule',
          flexible: s.flexible,
        }))
      }
      notify('Schedule uploaded')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload schedule')
    }
  }

  const onPickUploadType = (type: 'flex_a' | 'flex_b') => {
    setPendingUploadType(type)
    setUploadTypeOpen(false)
    fileRef.current?.click()
  }

  const patchMatch = (field: number, matchNumber: number, patch: Partial<Match>) => {
    const next = activeSchedule.map((m) =>
      m.field === field && m.match_number === matchNumber ? { ...m, ...patch } : m,
    )
    setActiveSchedule(next, Boolean(patch.flight1 || patch.flight2))
  }

  const updateFieldTimes = (field: number) => {
    setActiveSchedule(retimedFieldSchedule(activeSchedule, field, activeStart), false)
    notify(`Field ${field} times updated`)
  }

  const applyArrival = () => {
    update({ arrivalTime: draftArrival })
    notify('Arrival time updated')
  }

  const applyStart = () => {
    if (state.mode === 'flex_b') update({ flexBStartTime: draftStart })
    else update({ startTime: draftStart })
    notify('Start time updated')
  }

  const toggleHeadRef = (refereeName: string, checked: boolean) => {
    setState((s) => {
      const headReferees = { ...s.headReferees }
      if (checked) headReferees[refereeName] = true
      else delete headReferees[refereeName]
      const unassignedReferees = { ...s.unassignedReferees }
      if (unassignedReferees[refereeName]) {
        unassignedReferees[refereeName] = {
          ...unassignedReferees[refereeName],
          is_head: checked,
        }
      }
      return { ...s, headReferees, unassignedReferees }
    })
  }

  const deleteFlightReferee = (flight: string) => {
    setState((s) => {
      const referees = { ...s.referees }
      const name = referees[flight]
      delete referees[flight]
      const headReferees = { ...s.headReferees }
      if (name) delete headReferees[name]
      return { ...s, referees, headReferees }
    })
  }

  const deleteManualReferee = (name: string) => {
    setState((s) => {
      const unassignedReferees = { ...s.unassignedReferees }
      delete unassignedReferees[name]
      const headReferees = { ...s.headReferees }
      delete headReferees[name]
      return { ...s, unassignedReferees, headReferees }
    })
  }

  const addManualReferee = () => {
    const name = newRefName.trim()
    if (!name || addRefField == null) return
    setState((s) => {
      const unassignedReferees = {
        ...s.unassignedReferees,
        [name]: { field: addRefField, is_head: newRefHead, is_lead: newRefLead },
      }
      const headReferees = { ...s.headReferees }
      if (newRefHead) headReferees[name] = true
      else delete headReferees[name]
      return { ...s, unassignedReferees, headReferees }
    })
    setAddRefField(null)
    setNewRefName('')
    setNewRefHead(false)
    setNewRefLead(false)
    notify('Referee added')
  }

  const onDropReorder = (field: number, toIndex: number) => {
    const from = dragRef.current
    dragRef.current = null
    if (!from || from.field !== field) return
    setActiveSchedule(reorderFieldMatches(activeSchedule, field, from.index, toIndex), false)
  }

  return (
    <div className="app">
      <header className="brand">
        <div className="brand-title">FLEX SCHEDULING TOOL</div>
        <div className="brand-sub">GitHub Pages edition (runs fully in your browser)</div>
      </header>

      {toast && <div className="toast">{toast}</div>}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void applyUploaded(file, pendingUploadType)
        }}
      />

      {state.step === 'setup' && (
        <div className="card">
          <h1>Flex A Initial Setup</h1>

          <button type="button" className="upload-btn" onClick={() => setUploadTypeOpen(true)}>
            Upload Existing Schedule
          </button>
          <div className="or-divider">— OR —</div>

          <form onSubmit={onCreateSetup}>
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
        </div>
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
        <div className="card wide schedule-view">
          <h1>{title}</h1>
          {state.flexible && <div className="flex-badge">Flexible Scheduling Enabled</div>}

          <div className="time-controls">
            <div className="time-group">
              <span className="time-label">Arrival:</span>
              <strong>{formatTime12(state.arrivalTime)}</strong>
              <input
                type="time"
                value={draftArrival}
                onChange={(e) => setDraftArrival(e.target.value)}
              />
              <button type="button" className="tiny" onClick={applyArrival}>
                Update Arrival
              </button>
            </div>
            <div className="time-group">
              <span className="time-label">Start:</span>
              <strong>{formatTime12(activeStart)}</strong>
              <input
                type="time"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
              />
              <button type="button" className="tiny" onClick={applyStart}>
                Update Start
              </button>
            </div>
          </div>

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
              <button type="button" className="primary" onClick={() => update({ mode: 'flex_a' })}>
                View Flex A
              </button>
            )}
            <button
              type="button"
              className="gold"
              onClick={() => {
                downloadScheduleExcel({
                  schedule: activeSchedule,
                  className: title,
                  startTime: activeStart,
                  arrivalTime: state.arrivalTime,
                  referees: state.referees,
                  headReferees: state.headReferees,
                  unassignedReferees: state.unassignedReferees,
                })
                notify('Excel downloaded')
              }}
            >
              Download Excel
            </button>
            <button type="button" className="upload-btn compact" onClick={() => setUploadTypeOpen(true)}>
              Re-upload Excel
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                localStorage.removeItem('sos-flex-pages-state-v2')
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

          {fieldBlocks.map(([field, matches]) => {
            const assigned = activeFields[field - 1] || []
            const flightRefs = assigned.filter((f) => state.referees[f])
            const manuals = Object.entries(state.unassignedReferees).filter(
              ([, d]) => d.field === field,
            )

            return (
              <section key={field} className="field-block">
                <div className="field-head">
                  <h2>Field {field}</h2>
                  <button type="button" className="tiny" onClick={() => setAddRefField(field)}>
                    Add Referee
                  </button>
                </div>

                <div className="referee-section">
                  <strong>Referees</strong>
                  <div className="referee-list">
                    {flightRefs.map((flight) => {
                      const name = state.referees[flight]
                      return (
                        <div key={flight} className="referee-entry">
                          <button
                            type="button"
                            className="delete-ref"
                            onClick={() => deleteFlightReferee(flight)}
                            aria-label="Delete referee"
                          >
                            ×
                          </button>
                          <span className="ref-name">
                            {name} <em>({flight})</em>
                          </span>
                          <label className="head-toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(state.headReferees[name])}
                              onChange={(e) => toggleHeadRef(name, e.target.checked)}
                            />
                            Head Referee
                          </label>
                        </div>
                      )
                    })}
                    {manuals.map(([name, data]) => (
                      <div key={name} className="referee-entry">
                        <button
                          type="button"
                          className="delete-ref"
                          onClick={() => deleteManualReferee(name)}
                          aria-label="Delete referee"
                        >
                          ×
                        </button>
                        <span className="ref-name">
                          {name}
                          {data.is_lead ? ' · Lead' : ''}
                        </span>
                        <label className="head-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(state.headReferees[name] || data.is_head)}
                            onChange={(e) => toggleHeadRef(name, e.target.checked)}
                          />
                          Head Referee
                        </label>
                      </div>
                    ))}
                    {!flightRefs.length && !manuals.length && (
                      <p className="hint">No referees assigned to this field.</p>
                    )}
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Time</th>
                      <th>Transition</th>
                      <th>Matchup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m, index) => (
                      <tr
                        key={`${m.field}-${m.match_number}-${index}`}
                        draggable
                        className="match-row"
                        onDragStart={() => {
                          dragRef.current = { field, index }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropReorder(field, index)}
                      >
                        <td>
                          <input
                            className="cell-input narrow"
                            type="number"
                            min={1}
                            value={m.match_number}
                            onChange={(e) =>
                              patchMatch(field, m.match_number, {
                                match_number: Number(e.target.value) || 1,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            value={m.time}
                            onChange={(e) =>
                              patchMatch(field, m.match_number, { time: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            value={m.transition}
                            onChange={(e) =>
                              patchMatch(field, m.match_number, { transition: e.target.value })
                            }
                          />
                        </td>
                        <td className="matchup">
                          <input
                            className={`cell-input flight ${sqClass(m.flight1)}`}
                            value={m.flight1}
                            onChange={(e) =>
                              patchMatch(field, m.match_number, { flight1: e.target.value })
                            }
                          />
                          <span className="vs">vs</span>
                          <input
                            className={`cell-input flight ${sqClass(m.flight2)}`}
                            value={m.flight2}
                            onChange={(e) =>
                              patchMatch(field, m.match_number, { flight2: e.target.value })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {!matches.length && (
                      <tr>
                        <td colSpan={4} className="hint">
                          No matches on this field
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <button type="button" className="tiny" onClick={() => updateFieldTimes(field)}>
                  Update Time
                </button>
              </section>
            )
          })}

          <p className="hint save-note">Edits autosave in this browser.</p>
        </div>
      )}

      {uploadTypeOpen && (
        <div className="modal" onClick={() => setUploadTypeOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Select Schedule Type</h2>
            <p>Which type of schedule are you uploading?</p>
            <div className="modal-actions">
              <button type="button" className="upload-btn" onClick={() => onPickUploadType('flex_a')}>
                Flex A Schedule
              </button>
              <button type="button" className="upload-btn" onClick={() => onPickUploadType('flex_b')}>
                Flex B Schedule
              </button>
            </div>
            <button type="button" className="secondary" onClick={() => setUploadTypeOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {addRefField != null && (
        <div className="modal" onClick={() => setAddRefField(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Referee · Field {addRefField}</h2>
            <label>
              Referee Name
              <input
                value={newRefName}
                onChange={(e) => setNewRefName(e.target.value)}
                placeholder="Referee Name"
                autoFocus
              />
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={newRefHead}
                onChange={(e) => setNewRefHead(e.target.checked)}
              />
              Head Referee
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={newRefLead}
                onChange={(e) => setNewRefLead(e.target.checked)}
              />
              Lead Referee
            </label>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={addManualReferee}>
                Add
              </button>
              <button type="button" className="secondary" onClick={() => setAddRefField(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
