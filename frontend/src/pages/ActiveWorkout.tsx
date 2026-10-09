import { Check, ChevronLeft, Clock3, Gauge, MoreHorizontal, Plus, Timer, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getCurrentUser, saveWorkoutLog } from '../services/api'
import type { Exercise } from '../types'
import type { ActiveExercise, WorkoutLogCreate, WorkoutSet } from '../types/workout'

type ActiveSession = {
  routineId?: string
  name: string
  startedAt: string
  exercises: ActiveExercise[]
  setKinds: Record<string, SetKind>
}

type SetKind = 'normal' | 'warmup' | 'drop' | 'failure'

function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0')
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0')
  return hours === '00' ? `${minutes}:${remainingSeconds}` : `${hours}:${minutes}:${remainingSeconds}`
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  if (minutes === 0) return `${remaining}s`
  return `${minutes}min ${remaining}s`
}

function formatRest(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`
}

function reindexKeyedMap<T>(map: Record<string, T>, removedIndex: number): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) {
    const [indexPart, ...rest] = key.split(':')
    const index = Number(indexPart)
    if (index === removedIndex) continue
    next[[index > removedIndex ? index - 1 : index, ...rest].join(':')] = value
  }
  return next
}

function createSet(setNumber: number, source?: WorkoutSet): WorkoutSet {
  return { set_number: setNumber, weight_kg: source?.weight_kg ?? 0, reps: source?.reps ?? 0, is_completed: false }
}

function getSession(state: unknown): ActiveSession | null {
  if (!state || typeof state !== 'object' || !('name' in state) || !('exercises' in state)) return null
  const parsed = state as Partial<ActiveSession>
  return { ...parsed, setKinds: parsed.setKinds ?? {} } as ActiveSession
}

function ActiveWorkout() {
  const navigate = useNavigate()
  const location = useLocation()
  const routeSession = getSession(location.state)
  const [session, setSession] = useState<ActiveSession | null>(() => {
    if (routeSession) return routeSession
    const saved = sessionStorage.getItem('set_plate_active_workout')
    return saved ? getSession(JSON.parse(saved)) : null
  })
  const [now, setNow] = useState(() => Date.now())
  const [showFinish, setShowFinish] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [rpeValues, setRpeValues] = useState<Record<string, number>>({})
  const [menuOpen, setMenuOpen] = useState<number | null>(null)
  const [restRemaining, setRestRemaining] = useState<Record<number, number>>({})

  useEffect(() => {
    if (session) sessionStorage.setItem('set_plate_active_workout', JSON.stringify(session))
  }, [session])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
      setRestRemaining((current) => {
        let changed = false
        const next: Record<number, number> = {}
        for (const [key, value] of Object.entries(current)) {
          const remaining = value > 0 ? value - 1 : 0
          if (remaining !== value) changed = true
          if (remaining > 0) next[Number(key)] = remaining
        }
        return changed ? next : current
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const pending = sessionStorage.getItem('set_plate_pending_exercise')
    if (!pending) return
    try {
      const exercise = JSON.parse(pending) as Exercise
      setSession((current) => current ? ({
        ...current,
        exercises: [...current.exercises, { exercise_id: exercise.id, name: exercise.name, previous_weight_kg: null, previous_reps: null, notes: '', rest_enabled: false, sets: [createSet(1)] }],
      }) : current)
    } finally {
      sessionStorage.removeItem('set_plate_pending_exercise')
    }
  }, [])

  const durationSeconds = useMemo(() => session ? Math.max(0, Math.floor((now - Date.parse(session.startedAt)) / 1000)) : 0, [now, session])
  const completedSets = session?.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.is_completed).length, 0) ?? 0
  const volumeKg = session?.exercises.reduce((total, exercise) => (
    total + exercise.sets.reduce((sum, set) => sum + (set.is_completed ? set.weight_kg * set.reps : 0), 0)
  ), 0) ?? 0

  if (!session) return <div className="screen state-card" role="alert">No active workout selected.</div>

  function updateExercise(exerciseIndex: number, update: Partial<ActiveExercise>) {
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.map((exercise, index) => index !== exerciseIndex ? exercise : { ...exercise, ...update }),
    }) : current)
  }

  function updateSet(exerciseIndex: number, setIndex: number, update: Partial<WorkoutSet>) {
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.map((exercise, index) => index !== exerciseIndex ? exercise : ({
        ...exercise,
        sets: exercise.sets.map((set, currentIndex) => currentIndex !== setIndex ? set : { ...set, ...update }),
      })),
    }) : current)
  }

  function addSet(exerciseIndex: number) {
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.map((exercise, index) => {
        if (index !== exerciseIndex) return exercise
        const last = exercise.sets[exercise.sets.length - 1]
        return { ...exercise, sets: [...exercise.sets, createSet(exercise.sets.length + 1, last)] }
      }),
    }) : current)
  }

  function removeExercise(exerciseIndex: number) {
    setMenuOpen(null)
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.filter((_, index) => index !== exerciseIndex),
      setKinds: reindexKeyedMap(current.setKinds, exerciseIndex),
    }) : current)
    setRpeValues((current) => reindexKeyedMap(current, exerciseIndex))
    setRestRemaining((current) => reindexKeyedMap(current, exerciseIndex))
  }

  function updateSetKind(exerciseIndex: number, setNumber: number, kind: SetKind) {
    setSession((current) => current ? ({ ...current, setKinds: { ...current.setKinds, [`${exerciseIndex}:${setNumber}`]: kind } }) : current)
  }

  function updateRpe(exerciseIndex: number, setNumber: number) {
    const key = `${exerciseIndex}:${setNumber}`
    setRpeValues((current) => ({ ...current, [key]: current[key] ? current[key] % 10 + 1 : 1 }))
  }

  function toggleRest(exerciseIndex: number) {
    const enable = !session.exercises[exerciseIndex]?.rest_enabled
    updateExercise(exerciseIndex, { rest_enabled: enable })
    if (!enable) {
      setRestRemaining((current) => {
        if (!(exerciseIndex in current)) return current
        const next = { ...current }
        delete next[exerciseIndex]
        return next
      })
    }
  }

  function toggleSetComplete(exerciseIndex: number, setIndex: number, isCompleted: boolean) {
    updateSet(exerciseIndex, setIndex, { is_completed: isCompleted })
    const restOn = session.exercises[exerciseIndex]?.rest_enabled
    if (isCompleted && restOn) setRestRemaining((current) => ({ ...current, [exerciseIndex]: 90 }))
  }

  async function finishWorkout() {
    const user = getCurrentUser()
    const currentSession = session
    if (!user?.id || !currentSession) return
    setIsSaving(true)
    setSaveError(null)
    const payload: WorkoutLogCreate = {
      routine_id: currentSession.routineId,
      name: currentSession.name,
      duration_seconds: durationSeconds,
      started_at: currentSession.startedAt,
      completed_at: new Date().toISOString(),
      exercises: currentSession.exercises.map(({ exercise_id, sets }) => ({ exercise_id, sets })),
    }
    try {
      await saveWorkoutLog(user.id, payload)
      sessionStorage.removeItem('set_plate_active_workout')
      navigate('/')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save workout')
      setIsSaving(false)
    }
  }

  function discardWorkout() {
    sessionStorage.removeItem('set_plate_active_workout')
    navigate('/workouts')
  }

  return (
    <div className="screen active-workout-screen">
      <header className="active-workout-header">
        <button className="icon-button" type="button" onClick={() => navigate('/workouts')} aria-label="Back to workouts"><ChevronLeft size={22} /></button>
        <h1>Log Workout</h1>
        <span className="header-clock" aria-label="Elapsed time"><Clock3 size={16} />{formatClock(durationSeconds)}</span>
        <button className="finish-button" type="button" onClick={() => setShowFinish(true)}>Finish</button>
      </header>

      <section className="session-stats" aria-label="Workout stats">
        <div><span>Duration</span><strong>{formatDuration(durationSeconds)}</strong></div>
        <div><span>Volume</span><strong>{Math.round(volumeKg).toLocaleString()} kg</strong></div>
        <div><span>Sets</span><strong>{completedSets}</strong></div>
      </section>

      <div className="active-exercise-list">
        {session.exercises.map((exercise, exerciseIndex) => {
          const restSeconds = restRemaining[exerciseIndex] ?? 0
          return (
            <article className="card exercise-card" key={`${exercise.exercise_id}-${exerciseIndex}`}>
              <div className="exercise-card-header">
                <h2>{exercise.name}</h2>
                <button className="icon-button ghost" type="button" aria-label={`${exercise.name} options`} onClick={() => setMenuOpen(menuOpen === exerciseIndex ? null : exerciseIndex)}><MoreHorizontal size={18} /></button>
                {menuOpen === exerciseIndex && (
                  <div className="exercise-menu">
                    <button type="button" onClick={() => removeExercise(exerciseIndex)}><Trash2 size={15} /> Remove</button>
                  </div>
                )}
              </div>

              <button
                className={`rest-toggle${exercise.rest_enabled ? ' is-on' : ''}`}
                type="button"
                onClick={() => toggleRest(exerciseIndex)}
              >
                <Timer size={14} />
                Rest Timer: {exercise.rest_enabled ? (restSeconds > 0 ? formatRest(restSeconds) : 'ON') : 'OFF'}
              </button>

              <label className="exercise-notes">
                <span className="visually-hidden">Notes for {exercise.name}</span>
                <input
                  value={exercise.notes ?? ''}
                  placeholder="Add notes here..."
                  onChange={(event) => updateExercise(exerciseIndex, { notes: event.target.value })}
                />
              </label>

              <div className="set-table">
                <div className="set-row set-heading" aria-hidden="true"><span>SET</span><span>PREVIOUS</span><span>KG</span><span>REPS</span><span>RPE</span><span /></div>
                {exercise.sets.map((set, setIndex) => (
                  <div className={`set-row${set.is_completed ? ' set-row-complete' : ''}`} key={set.set_number}>
                    <select className={`set-kind-select set-kind-${session.setKinds[`${exerciseIndex}:${set.set_number}`] ?? 'normal'}`} value={session.setKinds[`${exerciseIndex}:${set.set_number}`] ?? 'normal'} onChange={(event) => updateSetKind(exerciseIndex, set.set_number, event.target.value as SetKind)} aria-label={`Set ${set.set_number} type`}>
                      <option value="normal">{set.set_number}</option>
                      <option value="warmup">W</option>
                      <option value="drop">D</option>
                      <option value="failure">F</option>
                    </select>
                    <span className="previous-cell">{exercise.previous_weight_kg !== null ? `${exercise.previous_weight_kg}kg x ${exercise.previous_reps}` : '-'}</span>
                    <input aria-label={`${exercise.name} set ${set.set_number} weight`} type="number" min="0" step="0.5" value={set.weight_kg || ''} onChange={(event) => updateSet(exerciseIndex, setIndex, { weight_kg: Number(event.target.value) })} />
                    <input aria-label={`${exercise.name} set ${set.set_number} reps`} type="number" min="0" step="1" value={set.reps || ''} onChange={(event) => updateSet(exerciseIndex, setIndex, { reps: Number(event.target.value) })} />
                    <button className="rpe-button" type="button" onClick={() => updateRpe(exerciseIndex, set.set_number)} aria-label={`Set ${set.set_number} RPE`}>{rpeValues[`${exerciseIndex}:${set.set_number}`] ?? <Gauge size={17} />}</button>
                    <button className={`done-button${set.is_completed ? ' is-done' : ''}`} type="button" onClick={() => toggleSetComplete(exerciseIndex, setIndex, !set.is_completed)} aria-label={`Toggle set ${set.set_number}`}><Check size={18} /></button>
                  </div>
                ))}
              </div>
              <button className="secondary-action" type="button" onClick={() => addSet(exerciseIndex)}><Plus size={16} /> Add Set</button>
            </article>
          )
        })}
      </div>

      <section className="add-exercise-section">
        <button className="secondary-action add-exercise-button" type="button" onClick={() => navigate('/workouts/active/exercises')}><Plus size={17} /> Add Exercise</button>
      </section>

      {showFinish && (
        <div className="modal-backdrop">
          <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="finish-title">
            <button className="modal-close" type="button" onClick={() => setShowFinish(false)} aria-label="Close"><X size={20} /></button>
            <p className="eyebrow">Session complete</p>
            <h2 id="finish-title">Finish workout?</h2>
            <p>{formatDuration(durationSeconds)} tracked. Save your completed sets or discard this session.</p>
            {saveError && <p className="form-error">{saveError}</p>}
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setShowFinish(false)} disabled={isSaving}>Keep training</button>
              <button className="danger-action" type="button" onClick={discardWorkout} disabled={isSaving}>Discard workout</button>
              <button className="primary-button" type="button" onClick={finishWorkout} disabled={isSaving}>{isSaving ? 'SAVING...' : 'SAVE WORKOUT'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ActiveWorkout
