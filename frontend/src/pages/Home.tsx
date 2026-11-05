import { Camera, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AiTipCard from '../components/home/AiTipCard'
import PremiumUpsellButton from '../components/premium/PremiumUpsellButton'
import { fetchDashboardSummary, getCachedDashboardSummary, getCurrentUser, planTodaysWorkout, type DashboardSummary } from '../services/api'
import { describeError } from '../utils/errors.js'

function formatMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
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
        <div className="home-header-actions">
          <PremiumUpsellButton />
          <span className="skeleton skeleton-badge" aria-hidden="true" />
        </div>
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
  const [error, setError] = useState<string | null>(null)
  const user = getCurrentUser()
  const userId = user?.id
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    fetchDashboardSummary()
      .then(async (data) => {
        if (!isMounted) return
        setSummary(data)
        if (data.plan || data.completed_workout_today || !userId) return
        try {
          await planTodaysWorkout(userId)
          const refreshed = await fetchDashboardSummary({ forceRefresh: true })
          if (isMounted) setSummary(refreshed)
        } catch {
          // Keep the dashboard available when planning is temporarily unavailable.
        }
      })
      .catch((requestError: Error) => {
        if (isMounted && !getCachedDashboardSummary()) {
          setError(describeError(requestError, "We couldn't load your dashboard. Please try again."))
        }
      })

    return () => {
      isMounted = false
    }
  }, [userId])

  if (error) return <div className="screen state-card" role="alert">{error}</div>
  if (!summary) return <HomeSkeleton />

  const { nutrition } = summary
  const plan = summary.plan
  const completedWorkoutToday = summary.completed_workout_today
  const calorieProgress = Math.max(
    0,
    Math.min(100, Math.round(((nutrition.target_kcals - nutrition.remaining_kcals) / nutrition.target_kcals) * 100)),
  )
  const macros = [
    { label: 'Protein', current: nutrition.current_protein, target: nutrition.target_protein },
    { label: 'Carbs', current: nutrition.current_carbs, target: nutrition.target_carbs },
    { label: 'Fat', current: nutrition.current_fat, target: nutrition.target_fat },
  ]
  const firstName = (summary.user_name || user?.name || '').split(' ')[0]

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">{summary.current_date_formatted}</p>
          <h1>Hello, {firstName}</h1>
        </div>
        <PremiumUpsellButton />
      </header>

      <section className="section" aria-labelledby="trainer-insight">
        <h2 className="section-title" id="trainer-insight">AI trainer</h2>
        <AiTipCard onApplied={() => fetchDashboardSummary({ forceRefresh: true }).then(setSummary).catch(() => undefined)} />
      </section>

      <section className="section" aria-labelledby="nutrition-summary">
        <h2 className="section-title" id="nutrition-summary">Today's plate</h2>
        <div className="card plate-card">
          <div className="plate-figure">
            <strong>{Math.abs(nutrition.remaining_kcals).toLocaleString()}<small>kcal {nutrition.remaining_kcals < 0 ? 'over' : 'left'}</small></strong>
            <span>of {nutrition.target_kcals.toLocaleString()} kcal</span>
          </div>
          <div className="progress-track" role="progressbar" aria-label="Daily calorie progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={calorieProgress}><div className="progress-value" style={{ width: `${calorieProgress}%` }} /></div>
          <div className="macro-card">
            {macros.map((macro) => <div className="macro" key={macro.label}>
              <span className="macro-label">{macro.label}</span>
              <span className="macro-value">{formatMacro(macro.current)}<small> / {formatMacro(macro.target)} g</small></span>
              <span className="macro-track" aria-hidden="true"><span style={{ width: `${macro.target > 0 ? Math.min(100, (macro.current / macro.target) * 100) : 0}%` }} /></span>
            </div>)}
          </div>
        </div>
        <div className="action-row">
          <button
            className="action-button"
            type="button"
            onClick={() => navigate('/log-meals')}
          >
            <Plus size={17} aria-hidden="true" /> Log meal
          </button>
          <button className="action-button" type="button" disabled><Camera size={17} aria-hidden="true" /> Scan plate <span className="pro-badge">Pro</span></button>
        </div>
      </section>

      <section className="section" aria-labelledby="programmed-training">
        <h2 className="section-title" id="programmed-training">Today's set</h2>
        {completedWorkoutToday ? (
          <div className="card training-card">
            <div className="scheduled-training-heading">
              <h3>Workout completed today</h3>
            </div>
            <p className="training-meta">{completedWorkoutToday.name}</p>
          </div>
        ) : plan ? (
          plan.is_rest_day ? (
            <div className="card training-card">
              <div className="scheduled-training-heading">
                <h3>Rest day</h3>
              </div>
              <p className="training-meta">Recovery recommended by your AI trainer</p>
              {plan.ai_reasoning && (
                <p className="training-reasoning">{plan.ai_reasoning}</p>
              )}
            </div>
          ) : (
          <div className="card training-card">
            <div className="scheduled-training-heading">
              <h3>{plan.title}</h3>
              {plan.routine_id === null ? (
                <span className="ai-adjusted-badge">AI generated</span>
              ) : plan.ai_adjusted && <span className="ai-adjusted-badge">AI adjusted</span>}
            </div>
            <p className="training-meta">{plan.exercises.length} exercises</p>
            {plan.exercises.length > 0 && (
              <ul className="scheduled-exercises" aria-label="Planned exercises and sets">
                {plan.exercises.map((exercise) => (
                  <li key={exercise.exercise_id}>
                    <span>{exercise.name}</span>
                    <span className="scheduled-exercise-sets">{exercise.sets} × {exercise.reps}{exercise.previous_weight_kg ? ` · ${exercise.previous_weight_kg} kg` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
            {plan.ai_adjusted && plan.ai_reasoning && (
              <p className="training-reasoning">{plan.ai_reasoning}</p>
            )}
            <button className="primary-button" type="button" onClick={() => navigate('/workouts/active', { state: {
              planId: plan.id,
              routineId: plan.routine_id,
              name: plan.title,
              startedAt: new Date().toISOString(),
              exercises: plan.exercises.map((exercise) => ({
                exercise_id: exercise.exercise_id,
                name: exercise.name,
                previous_weight_kg: exercise.previous_weight_kg ?? null,
                previous_reps: exercise.reps,
                target_sets: exercise.sets,
                target_reps: exercise.reps,
                sets: Array.from({ length: Math.max(1, exercise.sets) }, (_, index) => ({
                  set_number: index + 1,
                  weight_kg: exercise.previous_weight_kg ?? 0,
                  reps: exercise.reps,
                  is_completed: false,
                })),
              })),
            } })}>Start workout</button>
          </div>
          )
        ) : (
          <div className="card training-card empty-state">No workout scheduled for today.</div>
        )}
      </section>

    </div>
  )
}

export default Home
