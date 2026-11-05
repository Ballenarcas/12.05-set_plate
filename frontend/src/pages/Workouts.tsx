import { ArrowRight, BarChart3, Dumbbell, Pencil, Plus, Repeat2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PremiumUpsellButton from '../components/premium/PremiumUpsellButton'
import { deleteRoutine, deleteWorkoutHistoryEntry, fetchRoutines, fetchWorkoutHistory, getCurrentUser } from '../services/api'
import { describeError } from '../utils/errors.js'
import type { ActiveExercise, Routine, WorkoutHistoryEntry } from '../types/workout'

function formatWorkoutDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unavailable'
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes} min`
}

function formatWorkoutDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function createActiveExercises(routine: Routine): ActiveExercise[] {
  return routine.exercises.map((exercise) => ({
    exercise_id: exercise.exercise_id,
    name: exercise.name,
    previous_weight_kg: null,
    previous_reps: null,
    target_sets: exercise.target_sets,
    target_reps: exercise.target_reps,
    sets: Array.from({ length: exercise.target_sets ?? 1 }, (_, index) => ({
      set_number: index + 1,
      weight_kg: 0,
      reps: exercise.reps_by_set?.[index] ?? exercise.target_reps ?? 0,
      is_completed: false,
    })),
  }))
}

function summarizeSets(sets: WorkoutHistoryEntry['exercises'][number]['sets']): string {
  const heaviest = Math.max(0, ...sets.map((set) => set.weight_kg))
  return heaviest > 0 ? `${sets.length} × ${heaviest} kg` : `${sets.length} sets`
}

function Workouts() {
  const navigate = useNavigate()
  const currentUserId = getCurrentUser()?.id
  const [routines, setRoutines] = useState<Routine[]>([])
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isHistoryLoading, setIsHistoryLoading] = useState(() => Boolean(getCurrentUser()?.id))
  const [historyError, setHistoryError] = useState<string | null>(() => (
    getCurrentUser()?.id ? null : 'Sign in to view your workout history.'
  ))
  const [showDiscardActiveWorkout, setShowDiscardActiveWorkout] = useState(false)
  const [ongoingWorkoutName, setOngoingWorkoutName] = useState('your workout')
  const [routineToDelete, setRoutineToDelete] = useState<Routine | null>(null)
  const [isDeletingRoutine, setIsDeletingRoutine] = useState(false)
  const [routineDeleteError, setRoutineDeleteError] = useState<string | null>(null)
  const [workoutToDelete, setWorkoutToDelete] = useState<WorkoutHistoryEntry | null>(null)
  const [isDeletingWorkout, setIsDeletingWorkout] = useState(false)
  const [workoutDeleteError, setWorkoutDeleteError] = useState<string | null>(null)

  useEffect(() => {
    fetchRoutines()
      .then(setRoutines)
      .catch((requestError: Error) => setError(describeError(requestError, "We couldn't load your routines. Please try again.")))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!currentUserId) {
      setIsHistoryLoading(false)
      setHistoryError('Sign in to view your workout history.')
      return
    }

    let isMounted = true
    setIsHistoryLoading(true)
    setHistoryError(null)
    fetchWorkoutHistory(currentUserId)
      .then((items) => { if (isMounted) setWorkoutHistory(items) })
      .catch((requestError: Error) => {
        if (isMounted) setHistoryError(describeError(requestError, "We couldn't load your workout history. Please try again."))
      })
      .finally(() => {
        if (isMounted) setIsHistoryLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [currentUserId])

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

  function repeatWorkout(workout: WorkoutHistoryEntry) {
    const exercises: ActiveExercise[] = workout.exercises.map((exercise) => {
      const previousSets = [...exercise.sets].sort((first, second) => first.set_number - second.set_number)
      const lastSet = previousSets[previousSets.length - 1]

      return {
        exercise_id: exercise.exercise_id,
        name: exercise.name,
        previous_weight_kg: lastSet?.weight_kg ?? null,
        previous_reps: lastSet?.reps ?? null,
        target_sets: previousSets.length || 1,
        target_reps: lastSet?.reps ?? null,
        sets: previousSets.length > 0
          ? previousSets.map((set, index) => ({
            set_number: index + 1,
            weight_kg: set.weight_kg,
            reps: set.reps,
            is_completed: false,
          }))
          : [{ set_number: 1, weight_kg: 0, reps: 0, is_completed: false }],
      }
    })

    navigate('/workouts/active', {
      state: {
        name: workout.name,
        startedAt: new Date().toISOString(),
        exercises,
      },
    })
  }

  function editWorkout(workout: WorkoutHistoryEntry) {
    const exercises: ActiveExercise[] = workout.exercises.map((exercise) => {
      const sets = [...exercise.sets]
        .sort((first, second) => first.set_number - second.set_number)
        .map((set, index) => ({
          set_number: index + 1,
          weight_kg: set.weight_kg,
          reps: set.reps,
          rpe: set.rpe,
          is_completed: set.is_completed,
        }))

      return {
        exercise_id: exercise.exercise_id,
        name: exercise.name,
        previous_weight_kg: sets[sets.length - 1]?.weight_kg ?? null,
        previous_reps: sets[sets.length - 1]?.reps ?? null,
        target_sets: sets.length || 1,
        target_reps: sets[sets.length - 1]?.reps ?? null,
        sets: sets.length > 0 ? sets : [{ set_number: 1, weight_kg: 0, reps: 0, is_completed: false }],
      }
    })

    navigate('/workouts/active', {
      state: {
        editWorkoutId: workout.id,
        name: workout.name,
        startedAt: new Date().toISOString(),
        exercises,
      },
    })
  }

  function requestEmptyWorkout() {
    const saved = localStorage.getItem('set_plate_active_workout')
    if (saved) {
      try {
        const activeWorkout = JSON.parse(saved) as { name?: string; exercises?: unknown[]; startedAt?: string }
        if (activeWorkout.startedAt && Array.isArray(activeWorkout.exercises)) {
          setOngoingWorkoutName(activeWorkout.name || 'your workout')
          setShowDiscardActiveWorkout(true)
          return
        }
      } catch {
        localStorage.removeItem('set_plate_active_workout')
      }
    }
    startWorkout()
  }

  function discardAndStartEmptyWorkout() {
    localStorage.removeItem('set_plate_active_workout')
    sessionStorage.removeItem('set_plate_pending_exercise')
    setShowDiscardActiveWorkout(false)
    startWorkout()
  }

  async function confirmDeleteRoutine() {
    if (!routineToDelete) return
    setIsDeletingRoutine(true)
    setRoutineDeleteError(null)
    try {
      await deleteRoutine(routineToDelete.id)
      setRoutines((current) => current.filter((routine) => routine.id !== routineToDelete.id))
      setRoutineToDelete(null)
    } catch (requestError) {
      setRoutineDeleteError(requestError instanceof Error ? requestError.message : 'Unable to delete routine')
    } finally {
      setIsDeletingRoutine(false)
    }
  }

  async function confirmDeleteWorkout() {
    if (!workoutToDelete || !currentUserId) return
    setIsDeletingWorkout(true)
    setWorkoutDeleteError(null)
    try {
      await deleteWorkoutHistoryEntry(currentUserId, workoutToDelete.id)
      setWorkoutHistory((current) => current.filter((workout) => workout.id !== workoutToDelete.id))
      setWorkoutToDelete(null)
    } catch (requestError) {
      setWorkoutDeleteError(requestError instanceof Error ? requestError.message : "We couldn't remove this workout.")
    } finally {
      setIsDeletingWorkout(false)
    }
  }

  return (
    <div className="screen workouts-screen">
      <header className="workouts-page-header">
        <div className="workouts-heading">
          <h1>Workouts</h1>
          <PremiumUpsellButton />
        </div>
        <div className="workouts-header-actions">
          <button className="primary-button" type="button" onClick={requestEmptyWorkout}><Plus size={16} aria-hidden="true" /> Empty workout</button>
          <button className="secondary-action" type="button" onClick={() => navigate('/workouts/create')}><Plus size={16} aria-hidden="true" /> New routine</button>
        </div>
      </header>

      {isLoading && <div className="card state-card" role="status">Loading routines...</div>}
      {error && <div className="card state-card" role="alert">{error}</div>}
      {routineDeleteError && <div className="card routine-delete-error" role="alert">{routineDeleteError}</div>}

      <section className="workout-history-section" aria-labelledby="workout-history-title">
        <div className="workout-history-heading">
          <h2 className="section-title" id="workout-history-title">History</h2>
          <button className="text-action" type="button" onClick={() => navigate('/workouts/statistics')}>
            <BarChart3 size={16} aria-hidden="true" /> Statistics
          </button>
        </div>
        {isHistoryLoading && <div className="card state-card" role="status">Loading your workouts...</div>}
        {historyError && <div className="card state-card" role="alert">{historyError}</div>}
        {!isHistoryLoading && !historyError && workoutHistory.length === 0 && (
          <div className="card state-card"><Dumbbell size={24} aria-hidden="true" /><p>No completed workouts yet. Finish a workout to start building your history.</p></div>
        )}
        {!historyError && workoutHistory.length > 0 && (
          <div className="routine-list workout-history-list">
            {workoutHistory.map((workout) => (
              <article className="card workout-history-card" key={workout.id}>
                <div className="routine-card-heading">
                  <div>
                    <h2>{workout.name}</h2>
                    <p className="routine-meta">{formatWorkoutDate(workout.started_at)} · {formatWorkoutDuration(workout.duration_seconds)}</p>
                  </div>
                  <div className="workout-history-actions">
                    <button
                      className="routine-edit-button"
                      type="button"
                      aria-label={`Edit ${workout.name} workout`}
                      onClick={() => editWorkout(workout)}
                    >
                      <Pencil size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="history-delete-button"
                      type="button"
                      aria-label={`Delete ${workout.name} workout`}
                      onClick={() => { setWorkoutDeleteError(null); setWorkoutToDelete(workout) }}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {workout.exercises.length > 0 && (
                  <ul className="preview-rows">
                    {workout.exercises.slice(0, 3).map((exercise) => (
                      <li key={exercise.exercise_id}>
                        <span>{exercise.name}</span>
                        <span>{summarizeSets(exercise.sets)}</span>
                      </li>
                    ))}
                    {workout.exercises.length > 3 && <li><span>+{workout.exercises.length - 3} more</span></li>}
                  </ul>
                )}
                <button className="secondary-action card-action" type="button" onClick={() => repeatWorkout(workout)}>
                  <Repeat2 size={16} aria-hidden="true" /> Repeat workout
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="saved-routines-title">
        <h2 className="section-title" id="saved-routines-title">Saved routines</h2>
      {!isLoading && !error && routines.length === 0 && <div className="card state-card"><Dumbbell size={24} aria-hidden="true" /><p>No saved routines yet.</p></div>}

      <div className="routine-list">
        {routines.map((routine) => (
          <article className="card routine-card" key={routine.id}>
            <div className="routine-card-heading">
              <div>
                <h2>{routine.name}</h2>
                <p className="routine-meta">{routine.exercises.length} exercises{routine.estimated_duration_minutes !== null && ` · Est. ${routine.estimated_duration_minutes} min`}</p>
              </div>
              <div className="routine-card-actions">
                <button className="routine-edit-button" type="button" aria-label={`Edit ${routine.name}`} onClick={() => navigate('/workouts/create', { state: { routine } })}>
                  <Pencil size={17} aria-hidden="true" />
                </button>
                <button className="routine-delete-button" type="button" aria-label={`Delete ${routine.name}`} onClick={() => { setRoutineDeleteError(null); setRoutineToDelete(routine) }}>
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
            <ul className="preview-rows">
              {routine.exercises.slice(0, 3).map((exercise) => (
                <li key={exercise.exercise_id}>
                  <span>{exercise.name}</span>
                  {exercise.target_sets && exercise.target_reps ? <span>{exercise.target_sets} × {exercise.target_reps}</span> : null}
                </li>
              ))}
              {routine.exercises.length > 3 && <li><span>+{routine.exercises.length - 3} more</span></li>}
            </ul>
            <button className="secondary-action card-action" type="button" onClick={() => startWorkout(routine)}>Start workout <ArrowRight size={16} aria-hidden="true" /></button>
          </article>
        ))}
      </div>
      </section>

      {workoutToDelete && <div className="modal-backdrop">
        <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-workout-title">
          <p className="eyebrow">Remove workout history</p>
          <h2 id="delete-workout-title">Delete {workoutToDelete.name}?</h2>
          <p>This completed workout and its recorded sets will be permanently deleted. Saved routines will not be affected.</p>
          {workoutDeleteError && <p className="form-error" role="alert">{workoutDeleteError}</p>}
          <div className="modal-actions">
            <button className="secondary-action" type="button" onClick={() => setWorkoutToDelete(null)} disabled={isDeletingWorkout}>Cancel</button>
            <button className="danger-action" type="button" onClick={confirmDeleteWorkout} disabled={isDeletingWorkout}>
              {isDeletingWorkout ? 'Deleting...' : 'Delete workout'}
            </button>
          </div>
        </div>
      </div>}

      {routineToDelete && <div className="modal-backdrop">
        <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-routine-title">
          <p className="eyebrow">Remove saved routine</p>
          <h2 id="delete-routine-title">Delete {routineToDelete.name}?</h2>
          <p>The routine and its exercise plan will be deleted. Saved workout history will be kept.</p>
          {routineDeleteError && <p className="form-error" role="alert">{routineDeleteError}</p>}
          <div className="modal-actions">
            <button className="secondary-action" type="button" onClick={() => setRoutineToDelete(null)} disabled={isDeletingRoutine}>Cancel</button>
            <button className="danger-action" type="button" onClick={confirmDeleteRoutine} disabled={isDeletingRoutine}>
              {isDeletingRoutine ? 'Deleting...' : 'Delete routine'}
            </button>
          </div>
        </div>
      </div>}

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
