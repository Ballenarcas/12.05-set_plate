import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  Footprints,
  HeartPulse,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  Unplug,
  User,
} from 'lucide-react'
import PremiumUpsellButton from '../components/premium/PremiumUpsellButton'
import {
  clearDashboardCache,
  clearSession,
  fetchHealthConnectStatus,
  getCurrentUser,
  updateUserSettings,
} from '../services/api'
import {
  connectHealthConnect,
  disconnectHealthConnect,
  ensureHealthConnectFresh,
  syncHealthConnect,
} from '../services/healthConnect'
import type { HealthConnectStatus } from '../types/health'
import { describeError } from '../utils/errors.js'

type Notice = { kind: 'success' | 'error'; text: string }

function formatSyncTime(value: string | null): string {
  if (!value) return 'not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'not yet'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Settings() {
  const user = getCurrentUser()
  const navigate = useNavigate()

  const [age, setAge] = useState(user?.age?.toString() || '')
  const [weight, setWeight] = useState(user?.weight?.toString() || '')
  const [height, setHeight] = useState(user?.height?.toString() || '')
  const [gender, setGender] = useState(user?.gender || 'Male')
  const [objective, setObjective] = useState<string>(user?.objective || 'Hypertrophy')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
  const [health, setHealth] = useState<HealthConnectStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthBusy, setHealthBusy] = useState<'connecting' | 'syncing' | 'disconnecting' | null>(null)
  const [healthNotice, setHealthNotice] = useState<Notice | null>(null)
  const [isConnectOpen, setIsConnectOpen] = useState(false)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.kind === 'success' ? 5000 : 8000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!healthNotice) return
    const timer = window.setTimeout(() => setHealthNotice(null), healthNotice.kind === 'success' ? 5000 : 8000)
    return () => window.clearTimeout(timer)
  }, [healthNotice])

  useEffect(() => {
    if (!user?.id) {
      setHealthLoading(false)
      return
    }
    const userId = user.id
    let isMounted = true
    fetchHealthConnectStatus()
      .then(async (initial) => {
        if (!isMounted) return
        setHealth(initial)
        if (!initial.connected) return
        const refreshed = await ensureHealthConnectFresh(userId, initial)
        if (isMounted) setHealth(refreshed)
      })
      .catch((error: unknown) => {
        if (!isMounted) return
        setHealthNotice({
          kind: 'error',
          text: describeError(error, "We couldn't load your Health Connect status. Please try again."),
        })
      })
      .finally(() => {
        if (isMounted) setHealthLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [user?.id])

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

  const handleConnectHealth = async () => {
    if (!user?.id) return
    setIsConnectOpen(false)
    setHealthBusy('connecting')
    setHealthNotice(null)
    try {
      const next = await connectHealthConnect(user.id)
      setHealth(next)
      clearDashboardCache()
      setHealthNotice({
        kind: 'success',
        text: 'Health Connect is connected. Your steps and active calories now shape the AI trainer.',
      })
    } catch (error) {
      setHealthNotice({
        kind: 'error',
        text: describeError(error, "We couldn't connect Health Connect. Please try again."),
      })
    } finally {
      setHealthBusy(null)
    }
  }

  const handleSyncHealth = async () => {
    if (!user?.id) return
    setHealthBusy('syncing')
    setHealthNotice(null)
    try {
      const next = await syncHealthConnect(user.id)
      setHealth(next)
      clearDashboardCache()
      setHealthNotice({ kind: 'success', text: 'Activity synced from Health Connect.' })
    } catch (error) {
      setHealthNotice({
        kind: 'error',
        text: describeError(error, "We couldn't sync your activity. Please try again."),
      })
    } finally {
      setHealthBusy(null)
    }
  }

  const handleDisconnectHealth = async () => {
    setHealthBusy('disconnecting')
    setHealthNotice(null)
    try {
      const next = await disconnectHealthConnect()
      setHealth(next)
      clearDashboardCache()
      setHealthNotice({
        kind: 'success',
        text: 'Health Connect disconnected. The AI trainer no longer uses activity data.',
      })
    } catch (error) {
      setHealthNotice({
        kind: 'error',
        text: describeError(error, "We couldn't disconnect Health Connect. Please try again."),
      })
    } finally {
      setHealthBusy(null)
    }
  }

  const confirmLogout = () => {
    try {
      clearSession()
      sessionStorage.removeItem('set_plate_active_workout')
      sessionStorage.removeItem('set_plate_pending_exercise')
    } catch {
      // The redirect still signs the user out when storage is unavailable.
    }
    clearDashboardCache()
    setIsLogoutOpen(false)
    navigate('/login', { replace: true })
  }

  return (
    <div className="screen">
      {/* Styles injectés pour un look premium */}
      <style>{`
        .premium-card {
          background-color: #1A1A1A;
          border-radius: 16px;
          padding: 1.5rem;
          border: 1px solid #2E2E2E;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
          margin-bottom: 2rem;
        }
        .settings-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          border-bottom: 1px solid #2A2A2A;
        }
        .settings-row:last-of-type {
          border-bottom: none;
        }
        .settings-label {
          color: #A1A1AA;
          font-size: 0.95rem;
          font-weight: 500;
        }
        .settings-input {
          width: 160px;
          padding: 0.6rem 1rem;
          border-radius: 10px;
          background-color: #09090B;
          color: #FFF;
          border: 1px solid #333;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          outline: none;
        }
        .settings-input:focus {
          border-color: #8B5CF6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
        }
        .settings-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          margin-top: 1.5rem;
          background: linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%);
          color: white;
          border: none;
          padding: 1rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 1.05rem;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
        }
        .settings-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
        }
        .settings-btn:disabled {
          opacity: 0.7;
          cursor: progress;
          transform: none;
          box-shadow: none;
        }
        .settings-notice {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          margin-top: 1.5rem;
          padding: 0.75rem 0.9rem;
          border-radius: 12px;
          font-size: 0.9rem;
          line-height: 1.45;
        }
        .settings-notice svg {
          flex: none;
          margin-top: 0.1rem;
        }
        .settings-notice.success {
          color: #bbf7d0;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.35);
        }
        .settings-notice.error {
          color: #fecaca;
          background: rgba(248, 113, 113, 0.12);
          border: 1px solid rgba(248, 113, 113, 0.35);
        }
        .logout-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          margin-top: 1rem;
          background-color: transparent;
          color: #EF4444;
          border: 1px solid #EF4444;
          padding: 1rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 1.05rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .logout-btn:hover {
          background-color: rgba(239, 68, 68, 0.1);
        }
        .avatar-container {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #2A2A2A;
        }
        .avatar-circle {
          width: 3.5rem;
          height: 3.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #2E2E2E, #1A1A1A);
          border-radius: 50%;
          border: 1px solid #444;
          box-shadow: inset 0 2px 4px rgba(255,255,255,0.05);
        }
        .health-header {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
        }
        .health-icon {
          display: grid;
          flex: 0 0 auto;
          width: 2.75rem;
          height: 2.75rem;
          place-items: center;
          border: 1px solid rgba(40, 205, 98, 0.28);
          border-radius: 0.85rem;
          color: #28CD62;
          background: rgba(40, 205, 98, 0.1);
        }
        .health-heading {
          flex: 1;
          min-width: 0;
        }
        .health-heading h2 {
          margin: 0 0 0.25rem;
          color: #FFF;
          font-size: 1.1rem;
          font-weight: 650;
        }
        .health-heading p {
          margin: 0;
          color: #A1A1AA;
          font-size: 0.82rem;
          line-height: 1.45;
        }
        .health-status {
          flex: 0 0 auto;
          padding: 0.28rem 0.55rem;
          border: 1px solid #3A3A3A;
          border-radius: 99px;
          color: #A1A1AA;
          font-size: 0.66rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .health-status.is-connected {
          border-color: rgba(34, 197, 94, 0.4);
          color: #86EFAC;
          background: rgba(34, 197, 94, 0.1);
        }
        .health-loading {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 1rem;
          color: #A1A1AA;
          font-size: 0.85rem;
        }
        .health-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.65rem;
          margin-top: 1.15rem;
        }
        .health-stat {
          display: grid;
          grid-template-columns: auto 1fr;
          grid-template-rows: auto auto;
          column-gap: 0.55rem;
          align-items: center;
          padding: 0.8rem;
          border: 1px solid #2E2E2E;
          border-radius: 0.8rem;
          background: #141414;
        }
        .health-stat svg {
          grid-row: 1 / span 2;
          color: #8B5CF6;
        }
        .health-stat strong {
          color: #FFF;
          font-size: 1.2rem;
          line-height: 1.1;
        }
        .health-stat span {
          color: #A1A1AA;
          font-size: 0.7rem;
        }
        .health-meta {
          margin: 0.85rem 0 0;
          color: #A1A1AA;
          font-size: 0.75rem;
          line-height: 1.5;
        }
        .health-preview-note {
          margin: 0.55rem 0 0;
          color: #D6B85A;
          font-size: 0.72rem;
          line-height: 1.45;
        }
        .health-copy {
          margin: 1rem 0 0;
          color: #A1A1AA;
          font-size: 0.85rem;
          line-height: 1.5;
        }
        .health-actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 1rem;
        }
        .health-actions .secondary-action {
          flex: 1;
        }
        .health-disconnect {
          display: inline-flex;
          flex: 1;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          min-height: 2.75rem;
          padding: 0 0.8rem;
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: 0.7rem;
          color: #FCA5A5;
          background: transparent;
          cursor: pointer;
          font-size: 0.72rem;
          font-weight: 700;
        }
        .health-disconnect:disabled {
          opacity: 0.6;
          cursor: progress;
        }
        .health-connect-btn {
          margin-top: 1rem;
        }
        .health-permission-list {
          display: grid;
          gap: 0.55rem;
          margin: 1rem 0 0;
          padding: 0;
          list-style: none;
        }
        .health-permission-list li {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.7rem 0.8rem;
          border: 1px solid #2E2E2E;
          border-radius: 0.75rem;
          background: #141414;
        }
        .health-permission-list svg {
          flex: 0 0 auto;
          color: #8B5CF6;
        }
        .health-permission-list strong {
          display: block;
          color: #FFF;
          font-size: 0.85rem;
        }
        .health-permission-list span {
          display: block;
          color: #A1A1AA;
          font-size: 0.72rem;
        }
        .health-privacy {
          display: flex;
          align-items: flex-start;
          gap: 0.45rem;
          margin: 1rem 0 0;
          color: #A1A1AA;
          font-size: 0.76rem;
          line-height: 1.45;
        }
        .health-privacy svg {
          flex: 0 0 auto;
          margin-top: 0.1rem;
          color: #28CD62;
        }
      `}</style>

      <header className="screen-header">
        <div>
          <p className="eyebrow">Profile &amp; Preferences</p>
          <h1>Settings</h1>
        </div>
        <PremiumUpsellButton />
      </header>

      <section className="section">
        <div className="premium-card">
          
          <div className="avatar-container">
            <div className="avatar-circle">
              <User size={24} color="#D4D4D8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#FFF', fontWeight: '600' }}>
                {user ? `${user.name} ${user.surname}` : 'My Profile'}
              </h3>
              <span style={{ color: '#8B5CF6', fontSize: '0.85rem', fontWeight: '500' }}>
                {user?.email || 'Edit your personal details'}
              </span>
            </div>
          </div>

          <form onSubmit={handleSave}>
            
            <div className="settings-row">
              <label className="settings-label">Age</label>
              <input 
                type="number" 
                value={age} 
                onChange={(e) => setAge(e.target.value)} 
                className="settings-input"
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">Weight (kg)</label>
              <input 
                type="number" 
                step="0.1"
                value={weight} 
                onChange={(e) => setWeight(e.target.value)} 
                className="settings-input"
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">Height (cm)</label>
              <input 
                type="number" 
                value={height} 
                onChange={(e) => setHeight(e.target.value)} 
                className="settings-input"
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">
                Gender <br/>
                <span style={{fontSize: '0.75rem', color: '#52525B', fontWeight: 'normal'}}>For BMR calculation</span>
              </label>
              <select 
                value={gender} 
                onChange={(e) => setGender(e.target.value)} 
                className="settings-input"
                style={{ cursor: 'pointer' }}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="settings-row">
              <label className="settings-label">Main Goal</label>
              <select 
                value={objective} 
                onChange={(e) => setObjective(e.target.value)} 
                className="settings-input"
                style={{ cursor: 'pointer' }}
              >
                <option value="Hypertrophy">Hypertrophy</option>
                <option value="Strength">Strength</option>
                <option value="Endurance">Endurance</option>
                <option value="Weight Loss">Weight Loss</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>

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

            <button type="submit" className="settings-btn" disabled={isSaving}>
              {isSaving
                ? <><Loader2 size={20} className="animate-spin" aria-hidden="true" /> Saving...</>
                : <><Save size={20} aria-hidden="true" /> Save Changes</>}
            </button>
          </form>

        </div>
      </section>

      <section className="section" aria-labelledby="health-connect-heading">
        <div className="premium-card">
          <div className="health-header">
            <div className="health-icon" aria-hidden="true">
              <HeartPulse size={22} />
            </div>
            <div className="health-heading">
              <h2 id="health-connect-heading">Health Connect</h2>
              <p>Steps and active calories that sharpen your AI trainer guidance.</p>
            </div>
            <span className={`health-status ${health?.connected ? 'is-connected' : ''}`}>
              {healthLoading ? 'Checking' : health?.connected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {healthLoading ? (
            <div className="health-loading" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Checking Health Connect...
            </div>
          ) : health?.connected ? (
            <>
              <div className="health-stats">
                <div className="health-stat">
                  <Footprints size={18} aria-hidden="true" />
                  <strong>{health.activity.steps_today.toLocaleString()}</strong>
                  <span>steps today</span>
                </div>
                <div className="health-stat">
                  <Flame size={18} aria-hidden="true" />
                  <strong>{health.activity.active_calories_today}</strong>
                  <span>active kcal today</span>
                </div>
              </div>
              <p className="health-meta">
                Last synced {formatSyncTime(health.last_sync_at)}. Seven-day average{' '}
                {health.activity.steps_avg_7d.toLocaleString()} steps and{' '}
                {health.activity.active_calories_avg_7d} active kcal.
              </p>
              {health.source === 'preview' && (
                <p className="health-preview-note">
                  Browser preview uses sample activity. The Android app reads Health Connect directly.
                </p>
              )}
              <div className="health-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={handleSyncHealth}
                  disabled={healthBusy !== null}
                >
                  {healthBusy === 'syncing'
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <RefreshCw size={16} aria-hidden="true" />}
                  {healthBusy === 'syncing' ? 'Syncing...' : 'Sync now'}
                </button>
                <button
                  type="button"
                  className="health-disconnect"
                  onClick={handleDisconnectHealth}
                  disabled={healthBusy !== null}
                >
                  {healthBusy === 'disconnecting'
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <Unplug size={16} aria-hidden="true" />}
                  {healthBusy === 'disconnecting' ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="health-copy">
                Health Connect shares steps and active energy from your phone and wearables.
                SET&PLATE reads only those two data types.
              </p>
              <button
                type="button"
                className="settings-btn health-connect-btn"
                onClick={() => setIsConnectOpen(true)}
                disabled={healthBusy !== null}
              >
                {healthBusy === 'connecting'
                  ? <><Loader2 size={20} className="animate-spin" aria-hidden="true" /> Connecting...</>
                  : <><HeartPulse size={20} aria-hidden="true" /> Connect Health Connect</>}
              </button>
            </>
          )}

          {healthNotice && (
            <div
              className={`settings-notice ${healthNotice.kind}`}
              role={healthNotice.kind === 'error' ? 'alert' : 'status'}
            >
              {healthNotice.kind === 'success'
                ? <CheckCircle2 size={18} aria-hidden="true" />
                : <AlertCircle size={18} aria-hidden="true" />}
              <span>{healthNotice.text}</span>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <button onClick={() => setIsLogoutOpen(true)} className="logout-btn">
          <LogOut size={20} />
          Log Out
        </button>
      </section>

      {isConnectOpen && (
        <div className="modal-backdrop">
          <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="health-connect-title">
            <p className="eyebrow">Health Connect</p>
            <h2 id="health-connect-title">Allow SET&PLATE to read your activity?</h2>
            <p>
              Your AI trainer uses these daily totals to adapt calorie and training guidance.
              Nothing else from Health Connect is read.
            </p>
            <ul className="health-permission-list">
              <li>
                <Footprints size={18} aria-hidden="true" />
                <div>
                  <strong>Steps</strong>
                  <span>Daily step count</span>
                </div>
              </li>
              <li>
                <Flame size={18} aria-hidden="true" />
                <div>
                  <strong>Active calories</strong>
                  <span>Energy burned above resting</span>
                </div>
              </li>
            </ul>
            <p className="health-privacy">
              <ShieldCheck size={16} aria-hidden="true" />
              Only aggregated daily totals are stored. You can disconnect at any time.
            </p>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setIsConnectOpen(false)}>
                Not now
              </button>
              <button className="primary-button" type="button" onClick={handleConnectHealth}>
                Allow access
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

export default Settings
