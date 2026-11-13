import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Save, Trash2, Loader2, AlertCircle, Sparkles } from 'lucide-react'
import { 
  getCurrentUser, 
  isPremiumActive,
  fetchExerciseMuscleGroups, 
  createCustomExercise, 
  updateCustomExercise,
  deleteCustomExercise,
  fetchExerciseById,
  fetchExercises
} from '../services/api'
import { useDialogBehavior } from '../utils/useDialogBehavior'

export default function CustomExercise() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const isPremium = isPremiumActive(user)
  const isEditing = Boolean(id)

  const [name, setName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('Quads')
  const [equipment, setEquipment] = useState('')
  const [secondaryMuscles, setSecondaryMuscles] = useState('')
  const [notes, setNotes] = useState('')
  const [availableGroups, setAvailableGroups] = useState<string[]>([])
  
  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const deleteDialogRef = useDialogBehavior(showDeleteModal, () => setShowDeleteModal(false))

  useEffect(() => {
    if (!isPremium && !isEditing) return

    fetchExerciseMuscleGroups().then(groups => {
      if (groups.length > 0) {
        setAvailableGroups(groups)
        if (!isEditing) setMuscleGroup(groups.includes('Quads') ? 'Quads' : groups[0])
      }
    }).catch(() => {
      setAvailableGroups(['Quads', 'Chest', 'Back', 'Shoulders', 'Arms', 'Hamstrings', 'Calves', 'Glutes', 'Abs'])
    })

    if (isEditing && id) {
      fetchExerciseById(id).then(data => {
        setName(data.name)
        setMuscleGroup(data.muscle_group || 'General')
        setEquipment(Array.isArray(data.equipment) ? data.equipment.join(', ') : '')
        setSecondaryMuscles(Array.isArray(data.muscles_secondary) ? data.muscles_secondary.join(', ') : '')
        setNotes(data.description || '')
        setIsLoading(false)
      }).catch(() => {
        setError("Unable to load the exercise.")
        setIsLoading(false)
      })
    }
  }, [id, isEditing, isPremium])

  if (!isPremium && !isEditing) {
    return (
      <div className="screen">
        <header className="active-workout-header">
          <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={22} />
          </button>
          <div className="workout-title">
            <h1>Custom Exercise</h1>
          </div>
        </header>

        <div className="card" style={{ margin: '24px 16px', padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(176, 132, 233, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b084e9' }}>
            <Sparkles size={24} />
          </div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Upgrade to Premium</h2>
          <p style={{ margin: 0, color: '#a1a1a6', fontSize: '14px', lineHeight: 1.5 }}>
            Custom exercise creation is a Premium feature. Upgrade your account to create private exercises, add them to your routines, and track your stats.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '10px', marginTop: '8px' }}>
            <button className="primary-button" type="button" onClick={() => navigate('/premium')}>
              Upgrade to Premium
            </button>
            <button className="secondary-action" type="button" onClick={() => navigate(-1)}>
              Go back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      return setError("Exercise name cannot be empty.")
    }
    if (trimmedName.length < 2) {
      return setError("Exercise name must be at least 2 characters.")
    }
    if (trimmedName.length > 50) {
      return setError("Exercise name is too long (maximum 50 characters).")
    }

    setIsSaving(true)
    setError(null)

    try {
      const searchRes = await fetchExercises({ q: trimmedName, limit: 100 })
      const duplicate = searchRes.items.find(ex => ex.name.trim().toLowerCase() === trimmedName.toLowerCase() && ex.id !== id)
      
      if (duplicate) {
        setIsSaving(false)
        return setError(`The name is already in use by "${duplicate.name}".`)
      }

      const payload = {
        name: trimmedName,
        muscle_group: muscleGroup,
        equipment: equipment.split(',').map(s => s.trim()).filter(Boolean),
        muscles_secondary: secondaryMuscles.split(',').map(s => s.trim()).filter(Boolean),
        description: notes.trim() || undefined,
      }

      if (isEditing && id) {
        await updateCustomExercise(user.id, id, payload)
      } else {
        await createCustomExercise(user.id, payload)
      }
      sessionStorage.setItem('set_plate_reopen_exercise_modal', 'true')
      navigate(-1)
    } catch (err: any) {
      setError(err.message || "An error occurred while saving.")
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!user?.id || !id) return
    setIsSaving(true)
    try {
      await deleteCustomExercise(user.id, id)
      sessionStorage.setItem('set_plate_reopen_exercise_modal', 'true')
      navigate(-1)
    } catch (err: any) {
      setError(err.message || "An error occurred while deleting.")
      setIsSaving(false)
      setShowDeleteModal(false)
    }
  }

  if (isLoading) {
    return <div className="screen state-card"><Loader2 className="animate-spin" /></div>
  }

  return (
    <div className="screen">
      <header className="active-workout-header">
        <button
          className="icon-button"
          type="button"
          onClick={() => {
            sessionStorage.setItem('set_plate_reopen_exercise_modal', 'true')
            navigate(-1)
          }}
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="workout-title">
          <h1>{isEditing ? 'Edit Custom Exercise' : 'Create Custom Exercise'}</h1>
        </div>
      </header>

      <form onSubmit={handleSave} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, display: 'block', marginBottom: '8px' }}>EXERCISE NAME</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => {
                setName(e.target.value)
                setError(null)
            }}
            placeholder="e.g. Belt Squat Machine"
            style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#1c1c1e', border: '1px solid #333', color: '#fff', fontSize: '16px', boxSizing: 'border-box' }}
          />
          {error && (
            <div role="alert" style={{ color: '#ff4d4d', fontSize: '13px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, display: 'block', marginBottom: '8px' }}>MAIN MUSCLE GROUP</label>
          <select 
            value={muscleGroup} 
            onChange={(e) => setMuscleGroup(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#1c1c1e', border: '1px solid #333', color: '#fff', fontSize: '16px', boxSizing: 'border-box' }}
          >
            {availableGroups.map(group => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, display: 'block', marginBottom: '8px' }}>EQUIPMENT (OPTIONAL)</label>
          <input 
            type="text" 
            value={equipment} 
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="e.g. Machine, Cable..."
            style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#1c1c1e', border: '1px solid #333', color: '#fff', fontSize: '16px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, display: 'block', marginBottom: '8px' }}>SECONDARY MUSCLES (OPTIONAL)</label>
          <input 
            type="text" 
            value={secondaryMuscles} 
            onChange={(e) => setSecondaryMuscles(e.target.value)}
            placeholder="e.g. Glutes, Calves..."
            style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#1c1c1e', border: '1px solid #333', color: '#fff', fontSize: '16px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#8e8e93', fontWeight: 600, display: 'block', marginBottom: '8px' }}>NOTES (OPTIONAL)</label>
          <textarea 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Machine settings, seat height..."
            rows={3}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#1c1c1e', border: '1px solid #333', color: '#fff', fontSize: '16px', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className="primary-button" type="submit" disabled={isSaving} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isEditing ? 'Save Changes' : 'Save'}
          </button>
          
          {isEditing && (
            <button 
              className="danger-action" 
              type="button" 
              onClick={() => setShowDeleteModal(true)}
              style={{ padding: '14px', borderRadius: '8px', border: '1px solid #EF4444', backgroundColor: 'transparent', color: '#EF4444', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
            >
              <Trash2 size={18} /> Remove Exercise
            </button>
          )}
        </div>
      </form>

      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="confirmation-modal" role="dialog" aria-modal="true" ref={deleteDialogRef}>
            <h2 id="delete-title">Remove this exercise?</h2>
            <p>It will be removed from your exercise list, but your past workouts and statistics will not change.</p>
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setShowDeleteModal(false)} disabled={isSaving}>Cancel</button>
              <button className="danger-action" type="button" onClick={handleDelete} disabled={isSaving}>
                {isSaving ? 'Removing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
