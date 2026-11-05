import { Apple, ArrowRight, Dumbbell, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import '../styles/welcome.css'

function Welcome() {
  return (
    <main className="welcome-screen">
      <div className="welcome-mark"><Sparkles size={17} aria-hidden="true" /> SET&PLATE</div>
      <section className="welcome-hero" aria-labelledby="welcome-title">
                <h1 id="welcome-title">Train with purpose. Eat with clarity.</h1>
        <p>SET&PLATE brings your workouts, nutrition, and AI coaching into one daily rhythm built around your goals.</p>
        <div className="welcome-actions">
          <Link className="primary-button" to="/onboarding">Create your profile <ArrowRight size={18} aria-hidden="true" /></Link>
          <Link className="secondary-action" to="/login">I already have a profile</Link>
        </div>
      </section>
      <section className="welcome-features" aria-label="SET&PLATE features">
        <article className="welcome-feature"><Dumbbell size={19} aria-hidden="true" /><div><h2>Train smarter</h2><p>Workouts that respond to your progress.</p></div></article>
        <article className="welcome-feature"><Apple size={19} aria-hidden="true" /><div><h2>Fuel better</h2><p>Nutrition guidance that fits your routine.</p></div></article>
      </section>
    </main>
  )
}

export default Welcome
