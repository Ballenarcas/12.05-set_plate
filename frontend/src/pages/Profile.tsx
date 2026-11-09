import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, LogOut } from 'lucide-react'
import { cancelPremium, clearDashboardCache, clearSession, getCurrentUser, isPremiumActive, updateUserSettings } from '../services/api'
import { describeError } from '../utils/errors.js'
import { useDialogBehavior } from '../utils/useDialogBehavior'

type Notice = { kind: 'success' | 'error'; text: string }

const GOALS = ['Hypertrophy', 'Strength', 'Endurance', 'Lose Weight', 'Maintenance']

function Profile() {
  const user = getCurrentUser()
  const navigate = useNavigate()

  const [age, setAge] = useState(user?.age?.toString() || '')
  const [weight, setWeight] = useState(user?.weight?.toString() || '')
  const [height, setHeight] = useState(user?.height?.toString() || '')
  const [gender, setGender] = useState(user?.gender || 'Male')
  // Sign-up saves "Lose Weight" and older profiles saved "Weight Loss": both mean the same goal.
  const [objective, setObjective] = useState<string>((user?.objective as string) === 'Weight Loss' ? 'Lose Weight' : user?.objective || 'Hypertrophy')
  const [saved, setSaved] = useState({ age, weight, height, gender, objective })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isCancelled, setIsCancelled] = useState(Boolean(user?.premium_cancel_at_period_end))
  const [cancelError, setCancelError] = useState<string | null>(null)
  const cancelDialogRef = useDialogBehavior(isCancelOpen, () => setIsCancelOpen(false))
  const premiumEndDate = user?.premium_expires_at ? new Date(user.premium_expires_at).toLocaleDateString() : null
  const premiumStartDate = user?.premium_started_at ? new Date(user.premium_started_at).toLocaleDateString() : null
  const premiumPlanLabel = user?.premium_plan === 'annual' ? 'Annual' : user?.premium_plan === 'monthly' ? 'Monthly' : null

  const confirmCancelPremium = async () => {
    setIsCancelling(true)
    setCancelError(null)
    try {
      await cancelPremium()
      setIsCancelled(true)
      setIsCancelOpen(false)
    } catch (error) {
      setCancelError(describeError(error, "We couldn't cancel your subscription. Please try again."))
    } finally {
      setIsCancelling(false)
    }
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.kind === 'success' ? 5000 : 8000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    const ageValue = Number(age)
    const weightValue = Number(weight)
    const heightValue = Number(height)

    if (!age.trim() || !weight.trim() || !height.trim() || !gender.trim() || !objective.trim()) {
      setNotice({ kind: 'error', text: 'Fill in every field before saving your changes.' })
      return
    }
    if (!Number.isInteger(ageValue) || ageValue < 12 || ageValue > 120) {
      setNotice({ kind: 'error', text: 'Age must be a whole number between 12 and 120.' })
      return
    }
    if (!Number.isFinite(weightValue) || weightValue < 20 || weightValue > 350) {
      setNotice({ kind: 'error', text: 'Weight must be between 20 and 350 kg.' })
      return
    }
    if (!Number.isInteger(heightValue) || heightValue < 80 || heightValue > 250) {
      setNotice({ kind: 'error', text: 'Height must be a whole number between 80 and 250 cm.' })
      return
    }

    setIsSaving(true)
    setNotice(null)
    try {
      if (!user?.id) throw new Error('Your profile could not be found. Please sign in again.')
      await updateUserSettings(user.id, {
        age: ageValue,
        weight: weightValue,
        height: heightValue,
        gender,
        objective,
      })
      setSaved({ age, weight, height, gender, objective })
      setNotice({
        kind: 'success',
        text: 'Profile updated. Your next calorie and workout estimates will use these details.',
      })
    } catch (error) {
      setNotice({ kind: 'error', text: describeError(error, "We couldn't save your changes. Please try again.") })
    } finally {
      setIsSaving(false)
    }
  }

  const confirmLogout = () => {
    try {
      clearSession()
      localStorage.removeItem('set_plate_active_workout')
      sessionStorage.removeItem('set_plate_pending_exercise')
    } catch {
      // The redirect still signs the user out when storage is unavailable.
    }
    clearDashboardCache()
    setIsLogoutOpen(false)
    navigate('/login', { replace: true })
  }

  const hasChanges = age !== saved.age || weight !== saved.weight || height !== saved.height
    || gender !== saved.gender || objective !== saved.objective
  const isPremium = isPremiumActive(user)
  const initials = [user?.name, user?.surname].map((name) => name?.trim()[0] ?? '').join('').toUpperCase()

  return (
    <div className="screen">
      {/* Styles injectés pour un look premium */}

      <header className="profile-identity">
        <div className="profile-avatar" aria-hidden="true">{initials || '?'}</div>
        <div>
          <h1>{user ? `${user.name} ${user.surname}` : 'Profile'}</h1>
          <p>{saved.objective} · {isPremium ? 'Premium' : 'Free plan'}</p>
        </div>
      </header>

      <form onSubmit={handleSave}>
        <section className="section" aria-labelledby="profile-goal">
          <h2 className="section-title" id="profile-goal">Goal</h2>
          <div className="settings-card">
            <div className="settings-row">
              <label className="settings-label" htmlFor="profile-objective">
                Main goal
                <small>Sets calories and workouts</small>
              </label>
              <select id="profile-objective" value={objective} onChange={(e) => setObjective(e.target.value)} className="settings-input">
                {GOALS.map((goal) => <option key={goal} value={goal}>{goal}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="profile-body">
          <h2 className="section-title" id="profile-body">Body</h2>
          <div className="settings-card">
            <div className="settings-row">
              <label className="settings-label" htmlFor="profile-weight">Weight</label>
              <span className="profile-field">
                <input id="profile-weight" type="number" inputMode="decimal" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="settings-input" />
                <span>kg</span>
              </span>
            </div>
            <div className="settings-row">
              <label className="settings-label" htmlFor="profile-height">Height</label>
              <span className="profile-field">
                <input id="profile-height" type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} className="settings-input" />
                <span>cm</span>
              </span>
            </div>
            <div className="settings-row">
              <label className="settings-label" htmlFor="profile-age">Age</label>
              <span className="profile-field">
                <input id="profile-age" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className="settings-input" />
                <span>yrs</span>
              </span>
            </div>
            <div className="settings-row">
              <label className="settings-label" htmlFor="profile-gender">
                Gender
                <small>For BMR calculation</small>
              </label>
              <select id="profile-gender" value={gender} onChange={(e) => setGender(e.target.value)} className="settings-input">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </section>

        {notice && (
          <div
            className={`settings-notice ${notice.kind}`}
            role={notice.kind === 'error' ? 'alert' : 'status'}
          >
            {notice.kind === 'success'
              ? <CheckCircle2 size={18} aria-hidden="true" />
              : <AlertCircle size={18} aria-hidden="true" />}
            <span>{notice.text}</span>
          </div>
        )}

        {hasChanges && (
          <button type="submit" className="primary-button profile-save" disabled={isSaving}>
            {isSaving
              ? <><Loader2 size={20} className="animate-spin" aria-hidden="true" /> Saving...</>
              : 'Save changes'}
          </button>
        )}
      </form>

      <section className="section" aria-labelledby="subscription-title">
        <h2 className="section-title" id="subscription-title">Subscription</h2>
        <div className="settings-card">
          {isPremium ? (
            <>
              <div className="settings-row">
                <span className="settings-label">Plan</span>
                <span className="subscription-value">Premium{premiumPlanLabel ? ` · ${premiumPlanLabel}` : ''}</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Status</span>
                <span className={`subscription-value${isCancelled ? ' is-cancelled' : ' is-active'}`} role="status">
                  {isCancelled ? 'Cancelled' : 'Active'}
                </span>
              </div>
              {premiumStartDate && (
                <div className="settings-row">
                  <span className="settings-label">Started</span>
                  <span className="subscription-value">{premiumStartDate}</span>
                </div>
              )}
              {premiumEndDate && (
                <div className="settings-row">
                  <span className="settings-label">{isCancelled ? 'Access ends' : 'Active until'}</span>
                  <span className="subscription-value">{premiumEndDate}</span>
                </div>
              )}
              {isCancelled ? (
                <p className="subscription-note">You keep every Premium feature until your access ends.</p>
              ) : (
                <button type="button" onClick={() => setIsCancelOpen(true)} className="profile-row-button is-danger">
                  Cancel Premium
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => navigate('/premium', { state: { from: '/profile' } })} className="profile-row-button">
              <span className="settings-label">
                Go Premium
                <small>You're on the free plan</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="profile-account">
        <h2 className="section-title" id="profile-account">Account</h2>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">Email</span>
            <span className="profile-email">{user?.email || '–'}</span>
          </div>
          <button type="button" onClick={() => navigate('/faq')} className="profile-row-button">
            <span className="settings-label">FAQ & support</span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setIsLogoutOpen(true)} className="profile-row-button is-danger">
            <LogOut size={17} aria-hidden="true" />
            Log out
          </button>
        </div>
      </section>

      {isCancelOpen && (
        <div className="modal-backdrop">
          <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-premium-title" tabIndex={-1} ref={cancelDialogRef}>
            <p className="eyebrow">Your subscription</p>
            <h2 id="cancel-premium-title">Cancel Premium?</h2>
            <p>You keep Premium {premiumEndDate ? `until ${premiumEndDate}` : 'until your paid period ends'}. After that, your account returns to the free plan. Your meals and workouts stay in your account.</p>
            {cancelError && <p role="alert">{cancelError}</p>}
            <div className="modal-actions">
              <button className="secondary-action" type="button" disabled={isCancelling} onClick={() => setIsCancelOpen(false)}>
                Keep Premium
              </button>
              <button className="danger-action" type="button" disabled={isCancelling} onClick={confirmCancelPremium}>
                {isCancelling ? 'Cancelling...' : 'Cancel Premium'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLogoutOpen && (
        <div className="modal-backdrop">
          <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="logout-title">
            <p className="eyebrow">Your session</p>
            <h2 id="logout-title">Log out of SET&PLATE?</h2>
            <p>Your meals and workouts stay in your account. You can sign back in any time.</p>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setIsLogoutOpen(false)}>
                Stay signed in
              </button>
              <button className="danger-action" type="button" onClick={confirmLogout}>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Profile
