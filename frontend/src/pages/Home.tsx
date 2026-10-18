import { Apple, ArrowRight, CalendarDays, Camera, CircleUserRound, Dumbbell, Lightbulb, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardSummary, fetchRoutines, getCachedDashboardSummary, getCurrentUser, type DashboardSummary } from '../services/api'
import type { ActiveExercise, Routine } from '../types/workout'

const TRAINER_INSIGHT = 'AI insight will be displayed here'

function formatMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
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

function HomeSkeleton() {
  return (
    <div className="screen skeleton-screen" role="status" aria-busy="true" aria-label="Loading your dashboard">
      <header className="screen-header">
        <div className="profile-heading">
          <span className="skeleton skeleton-circle" aria-hidden="true" />
          <div className="skeleton-stack">
            <span className="skeleton skeleton-line w-short" aria-hidden="true" />
            <span className="skeleton skeleton-line w-mid tall" aria-hidden="true" />
          </div>
        </div>
        <span className="skeleton skeleton-badge" aria-hidden="true" />
      </header>

      <section className="skeleton-section" aria-hidden="true">
        <span className="skeleton skeleton-line w-short" />
        <div className="skeleton-card ai-banner-skeleton">
          <span className="skeleton skeleton-line w-long" />
        </div>
      </section>

      <section className="skeleton-section" aria-hidden="true">
        <span className="skeleton skeleton-line w-mid" />
        <span className="skeleton skeleton-line w-long" />
        <span className="skeleton skeleton-track" />
        <div className="skeleton-card skeleton-macros">
          <span className="skeleton skeleton-macro" />
          <span className="skeleton skeleton-macro" />
          <span className="skeleton skeleton-macro" />
        </div>
        <div className="skeleton-actions">
          <span className="skeleton skeleton-button" />
          <span className="skeleton skeleton-button" />
        </div>
      </section>

      <section className="skeleton-section" aria-hidden="true">
        <span className="skeleton skeleton-line w-mid" />
        <div className="skeleton-card">
          <span className="skeleton skeleton-line w-long tall" />
          <div className="skeleton-list">
            <span className="skeleton skeleton-meta" />
            <span className="skeleton skeleton-meta" />
          </div>
          <span className="skeleton skeleton-button" />
        </div>
      </section>
    </div>
  )
}

function Home() {
  const [summary, setSummary] = useState<DashboardSummary | null>(() => getCachedDashboardSummary())
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routinesLoading, setRoutinesLoading] = useState(true)
  const [routinesError, setRoutinesError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const user = getCurrentUser()
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    fetchDashboardSummary({ forceRefresh: true })
      .then((data) => {
        if (!isMounted) return
        setSummary(data)
      })
      .catch((requestError: Error) => {
        if (isMounted && !getCachedDashboardSummary()) setError(requestError.message)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    fetchRoutines()
      .then((data) => {
        if (isMounted) setRoutines(data)
      })
      .catch((requestError: Error) => {
        if (isMounted) setRoutinesError(requestError.message)
      })
      .finally(() => {
        if (isMounted) setRoutinesLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  function startRoutine(routine: Routine) {
    navigate('/workouts/active', {
      state: {
        routineId: routine.id,
        name: routine.name,
        startedAt: new Date().toISOString(),
        exercises: createActiveExercises(routine),
      },
    })
  }

  if (error) return <div className="screen state-card" role="alert">{error}</div>
  if (!summary) return <HomeSkeleton />

  const { nutrition, workout } = summary
  const calorieProgress = Math.max(
    0,
    Math.min(100, Math.round(((nutrition.target_kcals - nutrition.remaining_kcals) / nutrition.target_kcals) * 100)),
  )
  const macros = [
    { label: 'Protein', value: `${formatMacro(nutrition.current_protein)} / ${formatMacro(nutrition.target_protein)}g` },
    { label: 'Carbs', value: `${formatMacro(nutrition.current_carbs)} / ${formatMacro(nutrition.target_carbs)}g` },
    { label: 'Fat', value: `${formatMacro(nutrition.current_fat)} / ${formatMacro(nutrition.target_fat)}g` },
  ]
  const displayName = summary.user_name || [user?.name, user?.surname].filter(Boolean).join(' ')

  return (
    <div className="screen">
      <header className="screen-header">
        <div className="profile-heading">
          <div className="avatar" aria-label={`${displayName}'s profile`}><CircleUserRound size={23} aria-hidden="true" /></div>
          <div>
            <p className="eyebrow">Good morning</p>
            <h1>Hello, {displayName}</h1>
          </div>
        </div>
        <div className="date-badge"><CalendarDays size={16} aria-hidden="true" />{summary.current_date_formatted}</div>
      </header>

      <section className="section" aria-labelledby="trainer-insight">
        <h2 className="section-title" id="trainer-insight">AI Trainer</h2>
        <div className="card ai-banner">
          <Lightbulb size={21} aria-hidden="true" />
          <p>{TRAINER_INSIGHT}</p>
        </div>
      </section>

      <section className="section" aria-labelledby="nutrition-summary">
        <h2 className="section-title" id="nutrition-summary"><Apple size={16} aria-hidden="true" /> Nutrition summary</h2>
        <div className="progress-copy"><strong>{nutrition.remaining_kcals.toLocaleString('de-DE')} kcals remaining today</strong><span>{calorieProgress}% of goal</span></div>
        <div className="progress-track" role="progressbar" aria-label="Daily calorie progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={calorieProgress}><div className="progress-value" style={{ width: `${calorieProgress}%` }} /></div>
        <div className="card macro-card">
          {macros.map((macro) => <div className="macro" key={macro.label}><span className="macro-label">{macro.label}</span><span className="macro-value">{macro.value}</span></div>)}
        </div>
        <div className="action-row">
          <button
            className="action-button"
            type="button"
            onClick={() => navigate('/log-meals')}
          >
            <Plus size={17} aria-hidden="true" /> Manual Register
          </button>
          <button className="action-button" type="button" disabled><Camera size={17} aria-hidden="true" /> Scan plate <span className="pro-badge">PRO</span></button>
        </div>
      </section>

      <section className="section" aria-labelledby="programmed-training">
        <div className="home-routines-heading">
          <h2 className="section-title" id="programmed-training"><Dumbbell size={16} aria-hidden="true" /> Your routines</h2>
          <button className="home-routines-link" type="button" onClick={() => navigate('/workouts')}>All routines <ArrowRight size={14} aria-hidden="true" /></button>
        </div>
        {routinesLoading && <div className="card home-routines-state" role="status">Loading your routines...</div>}
        {routinesError && <div className="card home-routines-state home-routines-error" role="alert">{routinesError}</div>}
        {!routinesLoading && !routinesError && routines.length === 0 && (
          <div className="card training-card empty-state">
            <p>No saved routines yet.</p>
            <button className="secondary-action" type="button" onClick={() => navigate('/workouts/create')}>Create your first routine</button>
          </div>
        )}
        {!routinesLoading && !routinesError && routines.length > 0 && (
          <div className="home-routines-carousel" aria-label="Your saved routines">
            {routines.map((routine) => (
              <article className="card home-routine-card" key={routine.id}>
                <div className="home-routine-card-heading">
                  <div><p className="eyebrow">Saved routine</p><h3>{routine.name}</h3></div>
                  <Dumbbell size={21} aria-hidden="true" />
                </div>
                <div className="routine-meta">
                  <span>{routine.exercises.length} exercises</span>
                  {routine.estimated_duration_minutes !== null && <span>Est. {routine.estimated_duration_minutes} min</span>}
                </div>
                <ul className="routine-preview">
                  {routine.exercises.slice(0, 3).map((exercise) => <li key={exercise.exercise_id}>{exercise.name}</li>)}
                  {routine.exercises.length > 3 && <li>+{routine.exercises.length - 3} more</li>}
                </ul>
                <button className="primary-button" type="button" onClick={() => startRoutine(routine)}>START TRAINING <ArrowRight size={17} aria-hidden="true" /></button>
              </article>
            ))}
          </div>
        )}
        {workout && <p className="home-programmed-note">Programmed plan: {workout.title}</p>}
      </section>
    </div>
  )
}

export default Home
