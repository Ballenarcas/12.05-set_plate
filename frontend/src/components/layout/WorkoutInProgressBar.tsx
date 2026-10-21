import { ArrowUp, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type ActiveWorkoutSummary = { name: string; startedAt: string }

function readActiveWorkout(): ActiveWorkoutSummary | null {
  try {
    const stored = sessionStorage.getItem('set_plate_active_workout')
    if (!stored) return null
    const session = JSON.parse(stored) as Partial<ActiveWorkoutSummary>
    if (typeof session.startedAt !== 'string') return null
    return { name: session.name || 'Workout in progress', startedAt: session.startedAt }
  } catch {
    return null
  }
}

function formatElapsed(startedAt: string, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000))
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function WorkoutInProgressBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [workout, setWorkout] = useState(readActiveWorkout)
  const [now, setNow] = useState(Date.now)
  const [isDiscardOpen, setIsDiscardOpen] = useState(false)

  useEffect(() => {
    const refresh = () => {
      const next = readActiveWorkout()
      setWorkout((current) => current?.startedAt === next?.startedAt && current?.name === next?.name ? current : next)
      setNow(Date.now())
    }
    refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!workout || pathname.startsWith('/workouts/active')) return null

  function discardWorkout() {
    sessionStorage.removeItem('set_plate_active_workout')
    sessionStorage.removeItem('set_plate_pending_exercise')
    setWorkout(null)
    setIsDiscardOpen(false)
  }

  return (
    <>
      <section className="workout-progress-bar" aria-label="Workout in progress">
        <button className="workout-progress-resume" type="button" onClick={() => navigate('/workouts/active')} aria-label={`Resume ${workout.name}`}>
          <ArrowUp size={25} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <div className="workout-progress-copy">
          <div className="workout-progress-heading">
            <span className="workout-progress-indicator" aria-hidden="true" />
            <strong>{workout.name}</strong>
          </div>
          <small>Workout in progress</small>
        </div>
        <time className="workout-progress-time" aria-label="Workout duration">{formatElapsed(workout.startedAt, now)}</time>
        <button className="workout-progress-discard" type="button" onClick={() => setIsDiscardOpen(true)} aria-label="Discard workout">
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </section>

      {isDiscardOpen && (
        <div className="modal-backdrop">
          <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="discard-workout-title">
            <p className="eyebrow">Workout in progress</p>
            <h2 id="discard-workout-title">Discard this workout?</h2>
            <p>{workout.name} and its sets will be removed. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setIsDiscardOpen(false)}>
                Keep workout
              </button>
              <button className="danger-action" type="button" onClick={discardWorkout}>
                Discard workout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
