import { Link } from 'react-router-dom'
import { Sparkles, User, Dumbbell } from 'lucide-react'
import { getCurrentUser } from '../services/api'

function Settings() {
  const user = getCurrentUser()

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Profile &amp; Preferences</p>
          <h1>Settings</h1>
        </div>
      </header>

      {user ? (
        <section className="section">
          <h2 className="section-title">Current Profile</h2>
          <div className="card training-card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div className="avatar" style={{ width: '2.4rem', height: '2.4rem' }}>
                <User size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                  {user.name} {user.surname}
                </h3>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{user.email}</span>
              </div>
            </div>
            <div className="training-meta" style={{ flexWrap: 'wrap', gap: '0.75rem 1.25rem' }}>
              {user.age && <span>Age: {user.age}</span>}
              {user.gender && <span>Gender: {user.gender}</span>}
              {user.weight && <span>Weight: {user.weight} kg</span>}
              {user.height && <span>Height: {user.height} cm</span>}
              {user.objective && <span>Goal: {user.objective}</span>}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2 className="section-title">Onboarding Flow</h2>
        <div className="card training-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.45rem' }}>
            <Sparkles size={20} color="#8b5cf6" />
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Two-Screen Onboarding</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 1rem', lineHeight: 1.4 }}>
            Experience the modern Dark Mode onboarding flow with Account Setup and Fitness Personalization.
          </p>
          <Link
            to="/onboarding"
            className="action-button"
            style={{
              textDecoration: 'none',
              width: '100%',
              borderColor: '#8b5cf6',
              color: '#ffffff',
              borderRadius: '9999px',
            }}
          >
            Launch Onboarding Flow
          </Link>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Database &amp; Sync</h2>
        <div className="card training-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.45rem' }}>
            <Dumbbell size={20} color="var(--green)" />
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>wger Exercise Library</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0', lineHeight: 1.4 }}>
            918 exercises downloaded and indexed in catalog.
          </p>
        </div>
      </section>
    </div>
  )
}

export default Settings

