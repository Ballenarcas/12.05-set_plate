import { Link } from 'react-router-dom'
import DailyIntake from '../components/nutrition/DailyIntake'
import '../styles/welcome.css'

const PREVIEW_DAYS = [
  { label: 'Mo', trained: true }, { label: 'Tu', trained: false }, { label: 'We', trained: true }, { label: 'Th', trained: false },
  { label: 'Fr', trained: true }, { label: 'Sa', trained: false }, { label: 'Su', trained: false },
]

function Welcome() {
  return (
    <main className="welcome-screen">
      <p className="welcome-mark">SET&amp;PLATE</p>

      {/* A still of the Home screen with sample numbers, so people see the app before signing up. */}
      <div className="welcome-preview" aria-hidden="true" inert>
        <DailyIntake
          consumed={1545}
          goal={2400}
          macros={[
            { label: 'Protein', current: 92, target: 150 },
            { label: 'Carbs', current: 180, target: 280 },
            { label: 'Fat', current: 48, target: 75 },
          ]}
        />
        <div className="card activity-card">
          <p className="eyebrow">Last 7 days</p>
          <ol className="activity-bars">
            {PREVIEW_DAYS.map((day) => (
              <li key={day.label} className={day.trained ? 'is-trained' : undefined}>
                <span className="activity-bar" />
                <span className="activity-day">{day.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <section className="welcome-hero" aria-labelledby="welcome-title">
        <h1 id="welcome-title">Train with purpose.<br />Eat with clarity.</h1>
        <p>Log your workouts and meals in one place, with a plan that follows your progress.</p>
      </section>

      <div className="welcome-actions">
        <Link className="primary-button" to="/onboarding">Get started</Link>
        <p className="welcome-login">Already have an account? <Link to="/login">Log in</Link></p>
      </div>
    </main>
  )
}

export default Welcome
