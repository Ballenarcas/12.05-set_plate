import { ArrowRight, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteRoutine, fetchRoutines } from '../services/api'
import type { ActiveExercise, Routine } from '../types/workout'

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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDiscardActiveWorkout, setShowDiscardActiveWorkout] = useState(false)
  const [ongoingWorkoutName, setOngoingWorkoutName] = useState('your workout')
  const [routineToDelete, setRoutineToDelete] = useState<Routine | null>(null)
  const [isDeletingRoutine, setIsDeletingRoutine] = useState(false)
  const [routineDeleteError, setRoutineDeleteError] = useState<string | null>(null)

  useEffect(() => {
    fetchRoutines()
      .then(setRoutines)
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setIsLoading(false))
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

  return (
    <div className="screen workouts-screen">
      <header className="workouts-page-header">
        <div><p className="eyebrow">Train with purpose</p><h1>Workouts</h1></div>
        <div className="workouts-header-actions">
          <button className="secondary-action create-routine-action" type="button" onClick={() => navigate('/workouts/create')}><Plus size={16} /> Create Routine</button>
          <button className="secondary-action" type="button" onClick={requestEmptyWorkout}><Plus size={16} /> Start empty workout</button>
        </div>
      </header>

      {isLoading && <div className="card state-card" role="status">Loading routines...</div>}
      {error && <div className="card state-card" role="alert">{error}</div>}
      {routineDeleteError && <div className="card routine-delete-error" role="alert">{routineDeleteError}</div>}

      {!isLoading && !error && routines.length === 0 && <div className="card state-card"><Dumbbell size={24} aria-hidden="true" /><p>No saved routines yet.</p></div>}

      <div className="routine-list">
        {routines.map((routine) => (
          <article className="card routine-card" key={routine.id}>
            <div className="routine-card-heading">
              <div><p className="eyebrow">Saved routine</p><h2>{routine.name}</h2></div>
              <div className="routine-card-actions">
                <button className="routine-edit-button" type="button" aria-label={`Edit ${routine.name}`} onClick={() => navigate('/workouts/create', { state: { routine } })}>
                  <Pencil size={17} aria-hidden="true" />
                </button>
                <button className="routine-delete-button" type="button" aria-label={`Delete ${routine.name}`} onClick={() => { setRoutineDeleteError(null); setRoutineToDelete(routine) }}>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
                <Dumbbell size={22} aria-hidden="true" />
              </div>
            </div>
            <div className="routine-meta"><span>{routine.exercises.length} exercises</span>{routine.estimated_duration_minutes !== null && <span>Est. {routine.estimated_duration_minutes} min</span>}</div>
            <ul className="routine-preview">
              {routine.exercises.slice(0, 3).map((exercise) => <li key={exercise.exercise_id}>{exercise.name}</li>)}
              {routine.exercises.length > 3 && <li>+{routine.exercises.length - 3} more</li>}
            </ul>
            <button className="primary-button" type="button" onClick={() => startWorkout(routine)}>START WORKOUT <ArrowRight size={17} /></button>
          </article>
        ))}
      </div>

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
