import { ArrowLeft, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchExercises } from '../services/api'
import type { Exercise } from '../types'

function ExercisePicker() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let isCurrent = true
    setIsLoading(true)
    fetchExercises({ q: debouncedSearch || undefined, limit: 30, compact: true })
      .then((response) => {
        if (isCurrent) setExercises(response.items)
      })
      .catch((requestError: Error) => {
        if (isCurrent) setError(requestError.message)
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [debouncedSearch])

  function selectExercise(exercise: Exercise) {
    sessionStorage.setItem('set_plate_pending_exercise', JSON.stringify({ id: exercise.id, name: exercise.name, images: exercise.images.slice(0, 1) }))
    navigate('/workouts/active')
  }

  return (
    <div className="screen exercise-picker-screen">
      <header className="picker-header">
        <button className="icon-button" type="button" onClick={() => navigate('/workouts/active')} aria-label="Back to active workout"><ArrowLeft size={21} /></button>
        <div><p className="eyebrow">Active workout</p><h1>Add exercise</h1></div>
      </header>

      <label className="picker-search"><Search size={18} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" /></label>

      {isLoading && <div className="card state-card" role="status">Loading exercises...</div>}
      {error && <div className="card state-card" role="alert">{error}</div>}
      {!isLoading && !error && exercises.length === 0 && <div className="card state-card">No exercises found.</div>}

      <div className="exercise-picker-list">
        {exercises.map((exercise) => (
          <button className="exercise-picker-item" type="button" key={exercise.id} onClick={() => selectExercise(exercise)}>
            {exercise.images[0] ? <img src={exercise.images[0]} alt="" /> : <div className="exercise-image-placeholder" aria-hidden="true">+</div>}
            <span><strong>{exercise.name}</strong><small>{exercise.muscles.slice(0, 2).join(' · ') || exercise.category}</small></span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ExercisePicker
