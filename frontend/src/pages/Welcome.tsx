import { Apple, ArrowRight, Dumbbell, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import '../styles/welcome.css'

function Welcome() {
  return (
    <main className="welcome-screen">
      <div className="welcome-mark"><Sparkles size={17} aria-hidden="true" /> SET&PLATE</div>
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-kicker">Your adaptive wellness system</div>
        <h1 id="welcome-title">Train with purpose. Eat with clarity.</h1>
        <p>SET&PLATE brings your workouts, nutrition, and AI coaching into one daily rhythm built around your goals.</p>
        <Link className="welcome-cta" to="/onboarding">Create your profile <ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
      <section className="welcome-features" aria-label="SET&PLATE features">
        <article className="welcome-feature"><div className="welcome-feature-icon"><Dumbbell size={19} aria-hidden="true" /></div><div><h2>Train smarter</h2><p>Workouts that respond to your progress.</p></div></article>
        <article className="welcome-feature"><div className="welcome-feature-icon"><Apple size={19} aria-hidden="true" /></div><div><h2>Fuel better</h2><p>Nutrition guidance that fits your routine.</p></div></article>
      </section>
    </main>
  )
}

export default Welcome
