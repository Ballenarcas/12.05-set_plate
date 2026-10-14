import { useState, useEffect } from 'react'
import { User, Save, LogOut } from 'lucide-react'
import { getCurrentUser } from '../services/api'

function Settings() {
  const user = getCurrentUser()

  const [age, setAge] = useState(user?.age?.toString() || '')
  const [weight, setWeight] = useState(user?.weight?.toString() || '')
  const [height, setHeight] = useState(user?.height?.toString() || '')
  const [gender, setGender] = useState(user?.gender || 'Male')
  const [objective, setObjective] = useState(user?.objective || 'Hypertrophy')

  useEffect(() => {
    if (user) {
      setAge(user.age?.toString() || '')
      setWeight(user.weight?.toString() || '')
      setHeight(user.height?.toString() || '')
      setGender(user.gender || 'Male')
      setObjective(user.objective || 'Hypertrophy')
    }
  }, [user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!age.trim() || !weight.trim() || !height.trim() || !gender.trim() || !objective.trim()) {
      return alert("All fields must be filled out.")
    }

    try {
      const response = await fetch(`http://localhost:8000/settings/update?user_id=${user?.id || 'TEST_ID'}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: parseInt(age),
          weight: parseFloat(weight),
          height: parseInt(height),
          gender,
          objective
        }),
      })

      if (!response.ok) throw new Error("Erreur serveur")
      alert("Changes have been successfully saved!")
    } catch (error) {
      alert("Failed to save changes. Please try again.")
      console.error(error)
    }
  }

  const handleLogout = () => {
    // Logique de déconnexion (à adapter plus tard)
    alert("You have been logged out.")
    window.location.href = '/login'
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

            <button type="submit" className="settings-btn">
              <Save size={20} />
              Save Changes
            </button>
          </form>

          {/* Nouveau bouton de déconnexion */}
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={20} />
            Log Out
          </button>

        </div>
      </section>
    </div>
  )
}

export default Settings