import { Apple, CalendarDays, Camera, CircleUserRound, Dumbbell, Lightbulb, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardSummary, getCurrentUser, type DashboardSummary } from '../services/api'

function formatMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function Home() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [aiNotification, setAiNotification] = useState('Thinking...')
  const [error, setError] = useState<string | null>(null)
  const user = getCurrentUser()

  useEffect(() => {
    let isMounted = true

    const loadDashboard = () => {
      fetchDashboardSummary(true)
        .then((data) => {
          if (!isMounted) return
          setSummary(data)
          setAiNotification('AI Trainer insights will be configured soon.')
        })
        .catch((requestError: Error) => {
          if (isMounted) setError(requestError.message)
        })
    }

    loadDashboard()
    window.addEventListener('focus', loadDashboard)

    return () => {
      isMounted = false
      window.removeEventListener('focus', loadDashboard)
    }
  }, [])

  if (error) return <div className="screen state-card" role="alert">{error}</div>
  if (!summary) return <div className="screen state-card" role="status">Loading your dashboard...</div>

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
          <p>{aiNotification}</p>
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
