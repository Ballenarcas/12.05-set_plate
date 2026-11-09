import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AiTipCard from '../components/home/AiTipCard'
import WeekActivity from '../components/home/WeekActivity'
import DailyIntake from '../components/nutrition/DailyIntake'
import PremiumUpsellButton from '../components/premium/PremiumUpsellButton'
import { fetchDashboardSummary, getCachedDashboardSummary, getCurrentUser, planTodaysWorkout, type DashboardSummary } from '../services/api'
import { describeError } from '../utils/errors.js'

// Nothing shows while loading; screen readers still hear it.
function HomeSkeleton() {
  return <p className="visually-hidden" role="status">Loading your dashboard</p>
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

      <section className="section" aria-labelledby="nutrition-summary">
        <div className="section-heading">
          <h2 className="section-title" id="nutrition-summary">Nutrition</h2>
          <button className="text-link" type="button" onClick={() => navigate('/log-meals')}>Log a meal</button>
        </div>
        <DailyIntake consumed={nutrition.target_kcals - nutrition.remaining_kcals} goal={nutrition.target_kcals} macros={macros} />
      </section>

      {user?.id && (
        <section className="section" aria-labelledby="activity-summary">
          <div className="section-heading">
            <h2 className="section-title" id="activity-summary">Activity</h2>
            <button className="text-link" type="button" onClick={() => navigate('/workouts')}>Log a workout</button>
          </div>
          <WeekActivity userId={user.id} />
        </section>
      )}

      <section className="section" aria-labelledby="trainer-insight">
        <h2 className="section-title" id="trainer-insight">Recommended for you</h2>
        <AiTipCard onApplied={() => fetchDashboardSummary({ forceRefresh: true }).then(setSummary).catch(() => undefined)} />
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
