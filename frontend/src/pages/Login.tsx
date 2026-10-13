import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { findUserProfileByEmail } from '../services/api'
import type { UserProfile } from '../types'
import '../styles/onboarding.css'
import '../styles/login.css'

function Login() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setNotice('')
    const formData = new FormData(event.currentTarget)
    try {
      const foundProfile = await findUserProfileByEmail(String(formData.get('email') ?? ''))
      setProfile(foundProfile)
      window.setTimeout(() => navigate('/'), 1600)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not look up this profile')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (profile) {
    return (
      <main className="onboarding-container login-container">
        <div className="completion-overlay">
          <div className="completion-icon-wrapper"><Sparkles size={34} aria-hidden="true" /></div>
          <h1 className="onboarding-title">Welcome, {profile.name}!</h1>
          <p className="onboarding-subtitle">Your personalized training &amp; nutrition plan is ready.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="onboarding-container login-container">
      <div className="onboarding-content login-content">
        <div className="login-mark"><Sparkles size={17} aria-hidden="true" /> SET&PLATE</div>
        <header className="onboarding-header login-header">
          <h1 className="onboarding-title">Welcome back</h1>
          <p className="onboarding-subtitle">Enter the email address linked to your profile.</p>
          <p className="login-lookup-note">This checks whether a profile exists; it does not verify a password.</p>
        </header>

        <form className="onboarding-form login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="login-email" className="form-label">Email</label>
            <input
              id="login-email"
              name="email"
              className="form-input"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              required
              maxLength={255}
              onChange={() => setNotice('')}
            />
          </div>

          <div className="onboarding-actions login-actions">
            <button type="submit" className="btn-primary-outline" disabled={isSubmitting}>
              {isSubmitting ? 'Checking email…' : <>Continue <ArrowRight size={18} aria-hidden="true" /></>}
            </button>
            <Link className="btn-secondary-outline login-back-link" to="/welcome">
              <ArrowLeft size={17} aria-hidden="true" /> Back to welcome
            </Link>
          </div>
          {notice && <p className="login-notice" role="alert">{notice}</p>}
        </form>
      </div>

      <p className="login-create-prompt">
        New to SET&PLATE? <Link to="/onboarding">Create your profile</Link>
      </p>
    </main>
  )
}

export default Login
