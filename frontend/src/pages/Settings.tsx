import React, { useState, useEffect } from 'react';
import { User, Save, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, updateUserSettings } from '../services/api';
import type { UserProfile } from '../types';

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    age: '',
    weight: '',
    height: '',
    gender: 'Male',
    objective: 'Hypertrophy'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  
  // État pour la modale de déconnexion
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      setFormData({
        age: currentUser.age?.toString() || '',
        weight: currentUser.weight?.toString() || '',
        height: currentUser.height?.toString() || '',
        gender: currentUser.gender || 'Male',
        objective: currentUser.objective || 'Hypertrophy'
      });
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    setSaveMessage('');
    
    try {
      await updateUserSettings(user.id, {
        age: parseInt(formData.age, 10),
        weight: parseFloat(formData.weight),
        height: parseInt(formData.height, 10),
        gender: formData.gender,
        objective: formData.objective
      });
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Error saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    // Effacer les données de l'utilisateur
    localStorage.removeItem('set_plate_user');
    sessionStorage.clear();
    // Rediriger vers l'écran de connexion / bienvenue
    navigate('/welcome', { replace: true });
  };

  return (
    <div style={{ backgroundColor: '#121212', minHeight: '100vh', color: '#f3f3f5', padding: '24px 20px', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: '120px' }}>
      
      {/* STYLE GLOBAL POUR CACHER LES FLÈCHES ET STYLISER LES SELECTS */}
      <style>{`
        .hide-arrows::-webkit-outer-spin-button,
        .hide-arrows::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .hide-arrows {
          -moz-appearance: textfield;
        }
        .premium-select {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238e8e93%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E");
          background-repeat: no-repeat;
          background-position: right 12px top 50%;
          background-size: 16px auto;
        }
        .premium-select option {
          background-color: #1c1c1e;
          color: #f3f3f5;
        }
      `}</style>

      <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 24px 0', letterSpacing: '-0.5px' }}>Settings</h1>

      <div style={{ backgroundColor: '#1c1c1e', borderRadius: '24px', padding: '24px', border: '1px solid rgba(255,255,255,0.03)' }}>
        
        {/* PROFILE HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '24px', marginBottom: '24px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#28282a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }}>
            <User size={28} color="#8e8e93" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#ffffff' }}>
              {user?.name} {user?.surname}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#b084e9', fontSize: '14px', fontWeight: 500 }}>
              {user?.email}
            </p>
          </div>
        </div>

        {/* FORM FIELDS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '15px', fontWeight: 600, color: '#a1a1a6' }}>Age</label>
            <input 
              type="number" 
              name="age"
              value={formData.age}
              onChange={handleChange}
              className="hide-arrows"
              style={{ width: '120px', padding: '12px 16px', backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: '#ffffff', fontSize: '15px', fontWeight: 500, outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '15px', fontWeight: 600, color: '#a1a1a6' }}>Weight (kg)</label>
            <input 
              type="number" 
              name="weight"
              value={formData.weight}
              onChange={handleChange}
              className="hide-arrows"
              style={{ width: '120px', padding: '12px 16px', backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: '#ffffff', fontSize: '15px', fontWeight: 500, outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '15px', fontWeight: 600, color: '#a1a1a6' }}>Height (cm)</label>
            <input 
              type="number" 
              name="height"
              value={formData.height}
              onChange={handleChange}
              className="hide-arrows"
              style={{ width: '120px', padding: '12px 16px', backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: '#ffffff', fontSize: '15px', fontWeight: 500, outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#a1a1a6' }}>Gender</label>
              <span style={{ fontSize: '12px', color: '#545458', marginTop: '2px', display: 'block' }}>For BMR calculation</span>
            </div>
            <select 
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="premium-select"
              style={{ width: '150px', padding: '12px 36px 12px 16px', backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: '#ffffff', fontSize: '15px', fontWeight: 500, outline: 'none', cursor: 'pointer' }}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '15px', fontWeight: 600, color: '#a1a1a6' }}>Main Goal</label>
            <select 
              name="objective"
              value={formData.objective}
              onChange={handleChange}
              className="premium-select"
              style={{ width: '150px', padding: '12px 36px 12px 16px', backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: '#ffffff', fontSize: '15px', fontWeight: 500, outline: 'none', cursor: 'pointer' }}
            >
              <option value="Lose Weight">Lose Weight</option>
              <option value="Strength">Strength</option>
              <option value="Hypertrophy">Hypertrophy</option>
            </select>
          </div>

        </div>

        {/* SAVE BUTTON */}
        <button 
          onClick={handleSave}
          disabled={isSaving}
          style={{ 
            width: '100%', marginTop: '32px', padding: '16px', 
            background: 'linear-gradient(135deg, #9b51e0 0%, #b084e9 100%)', 
            border: 'none', borderRadius: '14px', color: '#ffffff', 
            fontSize: '16px', fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 15px rgba(155, 81, 224, 0.3)', transition: 'opacity 0.2s'
          }}
        >
          <Save size={20} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>

        {saveMessage && (
          <p style={{ textAlign: 'center', color: saveMessage.includes('Error') ? '#ff4d4d' : '#4cd964', fontSize: '14px', marginTop: '16px', fontWeight: 500 }}>
            {saveMessage}
          </p>
        )}

        {/* LOGOUT BUTTON */}
        <button 
          onClick={() => setShowLogoutConfirm(true)}
          style={{ 
            width: '100%', marginTop: '16px', padding: '16px', 
            backgroundColor: 'transparent', border: '1px solid rgba(255, 77, 77, 0.2)', 
            borderRadius: '14px', color: '#ff4d4d', 
            fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 77, 77, 0.05)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <LogOut size={18} />
          Disconnect
        </button>

      </div>

      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' 
        }}>
          <div style={{ 
            backgroundColor: '#1c1c1e', padding: '24px', borderRadius: '24px', width: '90%', maxWidth: '340px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>Disconnect?</h3>
            <p style={{ margin: 0, color: '#d1d1d6', fontSize: '14px', lineHeight: '1.5' }}>
              Are you sure you want to log out of your account? You will need to sign in again to access your data.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
              <button 
                onClick={() => setShowLogoutConfirm(false)} 
                style={{ background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', padding: '10px 16px', fontSize: '14.5px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                onClick={handleLogout} 
                style={{ backgroundColor: '#ff4d4d', border: 'none', color: '#ffffff', borderRadius: '12px', padding: '10px 24px', cursor: 'pointer', fontSize: '14.5px', fontWeight: 600 }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};