import { Apple, CalendarDays, Camera, CircleUserRound, Dumbbell, Lightbulb, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchDashboardSummary, generateTrainerInsight, getCurrentUser, type DashboardSummary } from '../services/api'

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
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [aiNotification, setAiNotification] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const user = getCurrentUser()

  useEffect(() => {
    let isMounted = true

    fetchDashboardSummary()
      .then((data) => {
        if (!isMounted) return
        setSummary(data)

        const currentUser = getCurrentUser()
        generateTrainerInsight({
          nutrition_summary: JSON.stringify(data.nutrition),
          training_summary: JSON.stringify(data.workout),
          user_goal: currentUser?.objective ?? '',
        })
          .then((response) => {
            if (isMounted) setAiNotification(response.insight)
          })
          .catch(() => {
            if (isMounted) setAiNotification('AI trainer insight is unavailable right now.')
          })
      })
      .catch((requestError: Error) => {
        if (isMounted) setError(requestError.message)
      })

    return () => {
      isMounted = false
    }
  }, [])

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
        <div className="card ai-banner" aria-busy={aiNotification === null}>
          <Lightbulb size={21} aria-hidden="true" />
          {aiNotification ? (
            <p>{aiNotification}</p>
          ) : (
            <span className="skeleton skeleton-line w-long" aria-hidden="true" />
          )}
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
          <button className="action-button" type="button" disabled><Plus size={17} aria-hidden="true" /> Manual Register</button>
          <button className="action-button" type="button" disabled><Camera size={17} aria-hidden="true" /> Scan plate <span className="pro-badge">PRO</span></button>
        </div>
      </section>

      <section className="section" aria-labelledby="programmed-training">
        <h2 className="section-title" id="programmed-training"><Dumbbell size={16} aria-hidden="true" /> Programmed training</h2>
        {workout ? (
          <div className="card training-card">
            <h3>{workout.title}</h3>
            <ul className="training-meta"><li>Volume: {workout.exercise_count} exercises</li><li>Est. duration: {workout.estimated_duration_minutes} minutes</li></ul>
            <button className="primary-button" type="button" disabled>START TRAINING!</button>
          </div>
        ) : (
          <div className="card training-card empty-state">No programmed training assigned.</div>
        )}
      </section>
    </div>
  )
}

export default Home
