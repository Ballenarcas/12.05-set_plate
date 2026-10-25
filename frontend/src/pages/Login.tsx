import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { loginUser } from '../services/api'
import { describeError } from '../utils/errors.js'
import type { UserProfile } from '../types'
import '../styles/onboarding.css'
import '../styles/login.css'

function Login() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setNotice('')
    const formData = new FormData(event.currentTarget)
    try {
      const signedInProfile = await loginUser(
        String(formData.get('email') ?? ''),
        String(formData.get('password') ?? ''),
      )
      setProfile(signedInProfile)
      window.setTimeout(() => navigate('/'), 1600)
    } catch (error) {
      setNotice(describeError(error, "We couldn't sign you in. Please try again."))
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
          <p className="onboarding-subtitle">Sign in to continue your training and nutrition journey.</p>
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

          <div className="form-field">
            <label htmlFor="login-password" className="form-label">Password</label>
            <div className="input-wrapper">
              <input
                id="login-password"
                name="password"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                maxLength={1024}
                onChange={() => setNotice('')}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="onboarding-actions login-actions">
            <button type="submit" className="btn-primary-outline" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : <>Sign in <ArrowRight size={18} aria-hidden="true" /></>}
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
