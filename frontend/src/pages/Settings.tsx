import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, LogOut, Save, User } from 'lucide-react'
import { clearDashboardCache, getCurrentUser, updateUserSettings } from '../services/api'
import { describeError } from '../utils/errors.js'

type Notice = { kind: 'success' | 'error'; text: string }

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
      localStorage.removeItem('set_plate_user')
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
      `}</style>

      <header className="screen-header">
        <div>
          <p className="eyebrow">Profile &amp; Preferences</p>
          <h1>Settings</h1>
        </div>
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

          <button onClick={() => setIsLogoutOpen(true)} className="logout-btn">
            <LogOut size={20} />
            Log Out
          </button>

        </div>
      </section>

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
