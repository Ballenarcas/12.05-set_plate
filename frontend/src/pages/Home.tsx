import { Apple, CalendarDays, Camera, CircleUserRound, Dumbbell, Lightbulb, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardSummary, getCachedDashboardSummary, getCurrentUser, planTodaysWorkout, type DashboardSummary } from '../services/api'
import { describeError } from '../utils/errors.js'

const TRAINER_INSIGHT = 'AI insight will be displayed here'

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
        <h2 className="section-title" id="programmed-training"><Dumbbell size={16} aria-hidden="true" /> Programmed training</h2>
        {completedWorkoutToday ? (
          <div className="card training-card">
            <div className="scheduled-training-heading">
              <h3>Workout completed today</h3>
            </div>
            <ul className="training-meta">
              <li>{completedWorkoutToday.name}</li>
            </ul>
          </div>
        ) : plan ? (
          plan.is_rest_day ? (
            <div className="card training-card">
              <div className="scheduled-training-heading">
                <h3>Rest day</h3>
              </div>
              <ul className="training-meta">
                <li>Recovery recommended by your AI trainer</li>
              </ul>
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
            <ul className="training-meta">
              <li>Today</li>
              <li>Volume: {plan.exercises.length} exercises</li>
            </ul>
            {plan.exercises.length > 0 && (
              <ul className="scheduled-exercises" aria-label="Planned exercises and sets">
                {plan.exercises.map((exercise) => (
                  <li key={exercise.exercise_id}>
                    <span>{exercise.name}</span>
                    <span className="scheduled-exercise-sets">{exercise.sets} sets · {exercise.reps} reps</span>
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
                previous_weight_kg: null,
                previous_reps: exercise.reps,
                target_sets: exercise.sets,
                target_reps: exercise.reps,
                sets: Array.from({ length: Math.max(1, exercise.sets) }, (_, index) => ({
                  set_number: index + 1,
                  weight_kg: 0,
                  reps: exercise.reps,
                  is_completed: false,
                })),
              })),
            } })}>START WORKOUT</button>
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
