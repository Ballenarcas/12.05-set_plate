import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { confirmPasswordReset } from '../services/api'
import { describeError } from '../utils/errors.js'
import '../styles/onboarding.css'
import '../styles/login.css'

const MIN_PASSWORD_LENGTH = 12

function ResetPassword() {
  const navigate = useNavigate()
  // Read once, then dropped from the address bar so the token isn't kept in history.
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== confirm) {
      setNotice("The two passwords don't match.")
      return
    }
    setIsSubmitting(true)
    setNotice('')
    try {
      const message = await confirmPasswordReset(token, password)
      navigate('/login', { replace: true, state: { notice: message } })
    } catch (error) {
      setNotice(describeError(error, "We couldn't update your password. Please try again."))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="onboarding-container login-container">
      <div className="onboarding-content login-content">
        <div className="login-mark">SET&amp;PLATE</div>
        <header className="onboarding-header login-header">
          <h1 className="onboarding-title">Set a new password</h1>
          <p className="onboarding-subtitle">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
        </header>

        {!token ? (
          <div className="login-form">
            <p className="login-notice" role="alert">This link is missing its code. Open the link from the email again, or ask for a new one.</p>
            <div className="onboarding-actions login-actions">
              <Link className="btn-primary-outline" to="/forgot-password">Ask for a new link</Link>
            </div>
          </div>
        ) : (
          <form className="onboarding-form login-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="new-password" className="form-label">New password</label>
              <div className="input-wrapper">
                <input
                  id="new-password"
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={128}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setNotice('') }}
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
            <div className="form-field">
              <label htmlFor="confirm-password" className="form-label">Repeat new password</label>
              <input
                id="confirm-password"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={128}
                value={confirm}
                onChange={(event) => { setConfirm(event.target.value); setNotice('') }}
              />
            </div>
            <div className="onboarding-actions login-actions">
              <button type="submit" className="btn-primary-outline" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save new password'}
              </button>
              <Link className="btn-secondary-outline login-back-link" to="/login">
                <ArrowLeft size={17} aria-hidden="true" /> Back to sign in
              </Link>
            </div>
            {notice && (
              <p className="login-notice" role="alert">
                {notice} {notice.includes('expired') && <Link to="/forgot-password">Ask for a new link</Link>}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}

export default ResetPassword
