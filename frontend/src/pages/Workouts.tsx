import { ArrowRight, Clock3, Dumbbell, History, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteWorkoutHistoryEntry, fetchRoutines, fetchWorkoutHistory, getCurrentUser } from '../services/api'
import type { ActiveExercise, Routine, WorkoutHistoryEntry } from '../types/workout'

function formatWorkoutDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes} min`
}

function formatWorkoutDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function createActiveExercises(routine: Routine): ActiveExercise[] {
  return routine.exercises.map((exercise) => ({
    exercise_id: exercise.exercise_id,
    name: exercise.name,
    previous_weight_kg: null,
    previous_reps: null,
    sets: Array.from({ length: exercise.target_sets ?? 1 }, (_, index) => ({
      set_number: index + 1,
      weight_kg: 0,
      reps: exercise.target_reps ?? 0,
      is_completed: false,
    })),
  }))
}

function Workouts() {
  const navigate = useNavigate()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyActionError, setHistoryActionError] = useState<string | null>(null)
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<string | null>(null)
  const [showDiscardActiveWorkout, setShowDiscardActiveWorkout] = useState(false)
  const [ongoingWorkoutName, setOngoingWorkoutName] = useState('your workout')

  useEffect(() => {
    fetchRoutines()
      .then(setRoutines)
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setIsLoading(false))

    const userId = getCurrentUser()?.id
    if (!userId) {
      setHistoryError('Sign in to view workout history.')
      setIsHistoryLoading(false)
      return
    }
    fetchWorkoutHistory(userId)
      .then(setHistory)
      .catch((requestError: Error) => setHistoryError(requestError.message))
      .finally(() => setIsHistoryLoading(false))
  }, [])

  function startWorkout(routine?: Routine) {
    navigate('/workouts/active', {
      state: {
        routineId: routine?.id,
        name: routine?.name ?? 'Empty workout',
        startedAt: new Date().toISOString(),
        exercises: routine ? createActiveExercises(routine) : [],
      },
    })
  }

  function requestEmptyWorkout() {
    const saved = sessionStorage.getItem('set_plate_active_workout')
    if (saved) {
      try {
        const activeWorkout = JSON.parse(saved) as { name?: string; exercises?: unknown[]; startedAt?: string }
        if (activeWorkout.startedAt && Array.isArray(activeWorkout.exercises)) {
          setOngoingWorkoutName(activeWorkout.name || 'your workout')
          setShowDiscardActiveWorkout(true)
          return
        }
      } catch {
        sessionStorage.removeItem('set_plate_active_workout')
      }
    }
    startWorkout()
  }

  function discardAndStartEmptyWorkout() {
    sessionStorage.removeItem('set_plate_active_workout')
    sessionStorage.removeItem('set_plate_pending_exercise')
    setShowDiscardActiveWorkout(false)
    startWorkout()
  }

  async function deleteHistoryEntry(workoutId: string) {
    if (!window.confirm('Delete this workout from your history? This cannot be undone.')) return
    const userId = getCurrentUser()?.id
    if (!userId) {
      setHistoryActionError('Sign in to manage workout history.')
      return
    }
    setDeletingWorkoutId(workoutId)
    setHistoryActionError(null)
    try {
      await deleteWorkoutHistoryEntry(userId, workoutId)
      setHistory((current) => current.filter((workout) => workout.id !== workoutId))
    } catch (requestError) {
      setHistoryActionError(requestError instanceof Error ? requestError.message : 'Unable to delete workout')
    } finally {
      setDeletingWorkoutId(null)
    }
  }

  return (
    <div className="screen workouts-screen">
      <header className="workouts-page-header">
        <div><p className="eyebrow">Train with purpose</p><h1>Workouts</h1></div>
        <button className="secondary-action" type="button" onClick={requestEmptyWorkout}><Plus size={16} /> Start empty workout</button>
      </header>

      {isLoading && <div className="card state-card" role="status">Loading routines...</div>}
      {error && <div className="card state-card" role="alert">{error}</div>}

      <section className="section workout-history-section" aria-labelledby="workout-history-title">
        <h2 className="section-title" id="workout-history-title"><History size={17} aria-hidden="true" /> Workout history</h2>
        {isHistoryLoading && <div className="card state-card" role="status">Loading workout history...</div>}
        {historyError && <div className="card state-card" role="alert">{historyError}</div>}
        {historyActionError && <div className="card state-card" role="alert">{historyActionError}</div>}
        {!isHistoryLoading && !historyError && history.length === 0 && <div className="card state-card">Completed workouts will appear here.</div>}
        {!historyError && history.length > 0 && <div className="workout-history-list">
          {history.map((workout) => {
            const setCount = workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0)
            const completedSetCount = workout.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.is_completed).length, 0)
            return (
              <article className="card workout-history-card" key={workout.id}>
                <div className="routine-card-heading">
                  <div><p className="eyebrow">{formatWorkoutDate(workout.started_at)}</p><h3>{workout.name}</h3></div>
                  <div className="workout-history-actions">
                    <Dumbbell size={20} aria-hidden="true" />
                    <button
                      className="history-delete-button"
                      type="button"
                      aria-label={`Delete ${workout.name} from history`}
                      title="Delete workout"
                      disabled={deletingWorkoutId === workout.id}
                      onClick={() => deleteHistoryEntry(workout.id)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="routine-meta">
                  <span><Clock3 size={14} aria-hidden="true" /> {formatWorkoutDuration(workout.duration_seconds)}</span>
                  <span>{workout.exercises.length} exercises</span>
                  <span>{completedSetCount}/{setCount} sets done</span>
                </div>
                {workout.exercises.length > 0 && <ul className="routine-preview">
                  {workout.exercises.map((exercise) => (
                    <li key={exercise.exercise_id}>
                      {exercise.name} · {exercise.sets.length} sets
                      {exercise.sets.some((set) => set.rpe !== null) && (
                        <small> · RPE {exercise.sets.filter((set) => set.rpe !== null).map((set) => set.rpe).join(', ')}</small>
                      )}
                    </li>
                  ))}
                </ul>}
              </article>
            )
          })}
        </div>}
      </section>

      {!isLoading && !error && routines.length === 0 && <div className="card state-card"><Dumbbell size={24} aria-hidden="true" /><p>No saved routines yet.</p></div>}

      <div className="routine-list">
        {routines.map((routine) => (
          <article className="card routine-card" key={routine.id}>
            <div className="routine-card-heading"><div><p className="eyebrow">Saved routine</p><h2>{routine.name}</h2></div><Dumbbell size={22} aria-hidden="true" /></div>
            <div className="routine-meta"><span>{routine.exercises.length} exercises</span>{routine.estimated_duration_minutes !== null && <span>Est. {routine.estimated_duration_minutes} min</span>}</div>
            <ul className="routine-preview">
              {routine.exercises.slice(0, 3).map((exercise) => <li key={exercise.exercise_id}>{exercise.name}</li>)}
              {routine.exercises.length > 3 && <li>+{routine.exercises.length - 3} more</li>}
            </ul>
            <button className="primary-button" type="button" onClick={() => startWorkout(routine)}>START WORKOUT <ArrowRight size={17} /></button>
          </article>
        ))}
      </div>

      {showDiscardActiveWorkout && <div className="modal-backdrop">
        <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="discard-active-workout-title">
          <p className="eyebrow">Workout in progress</p>
          <h2 id="discard-active-workout-title">Discard ongoing workout?</h2>
          <p>{ongoingWorkoutName} hasn’t been saved. Discard it and start an empty workout?</p>
          <div className="modal-actions">
            <button className="secondary-action" type="button" onClick={() => setShowDiscardActiveWorkout(false)}>Keep workout</button>
            <button className="danger-action" type="button" onClick={discardAndStartEmptyWorkout}>Discard &amp; start empty</button>
          </div>
        </div>
      </div>}
    </div>
  )
}

export default Workouts
