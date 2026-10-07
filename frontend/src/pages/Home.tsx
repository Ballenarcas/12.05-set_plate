import { Camera, CircleUserRound, Lightbulb, Plus } from 'lucide-react'
import { getCurrentUser } from '../services/api'

const macros = [
  { label: 'Protein', value: '45 / 160g' },
  { label: 'Carbs', value: '120 / 250g' },
  { label: 'Fat', value: '30 / 70g' },
]

function Home() {
  const user = getCurrentUser()
  const userName = user?.name || 'Ruben'

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Good morning</p>
          <h1>Hello, {userName}</h1>
        </div>
        <div className="avatar" aria-label={`${userName}'s profile`}><CircleUserRound size={23} aria-hidden="true" /></div>
      </header>
      <div className="date-badge">Tue, sept 22</div>

      <section className="section" aria-labelledby="trainer-insight">
        <h2 className="section-title" id="trainer-insight">AI Trainer</h2>
        <div className="card ai-banner">
          <Lightbulb size={21} aria-hidden="true" />
          <p>Yesterday you ended with a 450 calorie deficit. I adjusted today&apos;s routine&apos;s volume accordingly.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="nutrition-summary">
        <h2 className="section-title" id="nutrition-summary">Nutrition summary</h2>
        <div className="progress-copy"><strong>1.420 kcals remaining today</strong><span>44% of goal</span></div>
        <div className="progress-track" role="progressbar" aria-label="Daily calorie progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={44}><div className="progress-value" /></div>
        <div className="card macro-card">
          {macros.map((macro) => <div className="macro" key={macro.label}><span className="macro-label">{macro.label}</span><span className="macro-value">{macro.value}</span></div>)}
        </div>
        <div className="action-row">
          <button className="action-button" type="button"><Plus size={17} aria-hidden="true" /> Manual Register</button>
          <button className="action-button" type="button"><Camera size={17} aria-hidden="true" /> Scan plate</button>
        </div>
      </section>

      <section className="section" aria-labelledby="programmed-training">
        <h2 className="section-title" id="programmed-training">Programmed training</h2>
        <div className="card training-card">
          <h3>Upper Body</h3>
          <div className="training-meta"><span>4 exercises</span><span>45 minutes</span></div>
          <button className="primary-button" type="button">START TRAINING!</button>
        </div>
      </section>
    </div>
  )
}

export default Home
