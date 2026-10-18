import { ArrowLeft, Check, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRoutine, fetchExercises } from '../services/api'
import type { Exercise } from '../types'

type RoutineExerciseDraft = {
  exercise_id: string
  name: string
  target_sets: number
  target_reps: number
}

function CreateRoutine() {
  const navigate = useNavigate()
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [selectedExercises, setSelectedExercises] = useState<RoutineExerciseDraft[]>([])
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [exerciseError, setExerciseError] = useState<string | null>(null)
  const isLoading = resolvedQuery !== debouncedSearch

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let isCurrent = true
    fetchExercises({ q: debouncedSearch || undefined, page: 1, limit: 8, compact: true })
      .then((result) => {
        if (isCurrent) {
          setExercises(result.items)
          setExerciseError(null)
          setResolvedQuery(debouncedSearch)
        }
      })
      .catch((requestError: Error) => {
        if (isCurrent) {
          setExerciseError(requestError.message)
          setResolvedQuery(debouncedSearch)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [debouncedSearch])

  function addExercise(exercise: Exercise) {
    setSelectedExercises((current) => current.some((item) => item.exercise_id === exercise.id)
      ? current
      : [...current, {
        exercise_id: exercise.id,
        name: exercise.name,
        target_sets: 3,
        target_reps: 10,
      }])
  }

  function updateExercise(index: number, field: 'target_sets' | 'target_reps', value: number) {
    const safeValue = Math.min(30, Math.max(1, value || 1))
    setSelectedExercises((current) => current.map((exercise, exerciseIndex) =>
      exerciseIndex === index ? { ...exercise, [field]: safeValue } : exercise))
  }

  async function saveRoutine() {
    setError(null)
    if (!name.trim()) {
      setNameError('Please enter a name for your routine.')
      nameInputRef.current?.focus()
      return
    }
    setNameError(null)
    setIsSaving(true)
    try {
      await createRoutine({
        name: name.trim(),
        exercises: selectedExercises.map(({ exercise_id, target_sets, target_reps }) => ({
          exercise_id,
          target_sets,
          target_reps,
        })),
      })
      navigate('/workouts', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create routine')
    } finally {
      setIsSaving(false)
    }
  }

  const selectedIds = new Set(selectedExercises.map((exercise) => exercise.exercise_id))
  const canSave = selectedExercises.length > 0 && !isSaving

  return (
    <div className="screen routine-builder-screen">
      <header className="routine-builder-header">
        <button className="icon-button" type="button" onClick={() => navigate('/workouts')} aria-label="Back to workouts">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div><p className="eyebrow">Build your training plan</p><h1>Create Routine</h1></div>
      </header>

      <section className="routine-builder-intro">
        <strong>Make every session count.</strong>
        <p>Name your routine, choose exercises, and set your target volume. You can adjust your plan any time.</p>
      </section>

      <div className="card routine-builder-fields">
        <label htmlFor="routine-name">Routine name</label>
        <input
          ref={nameInputRef}
          id="routine-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (event.target.value.trim()) setNameError(null)
          }}
          maxLength={100}
          placeholder="e.g. Upper body strength"
          autoComplete="off"
          aria-invalid={nameError ? 'true' : undefined}
          aria-describedby={nameError ? 'routine-name-error' : undefined}
          className={nameError ? 'routine-name-input is-invalid' : 'routine-name-input'}
        />
        {nameError && <span className="routine-builder-error" id="routine-name-error" role="alert">{nameError}</span>}
      </div>

      <section aria-labelledby="routine-exercises-title">
        <div className="routine-builder-section-heading">
          <h2 id="routine-exercises-title">Choose exercises</h2>
          <span>{selectedExercises.length} selected</span>
        </div>

        <label className="picker-search routine-builder-search">
          <Search size={18} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the exercise library" aria-label="Search exercises" />
        </label>

        {isLoading && <div className="card state-card" role="status">Loading exercises...</div>}
        {exerciseError && <div className="card state-card" role="alert">{exerciseError}</div>}
        {!isLoading && !exerciseError && exercises.length === 0 && <div className="routine-builder-empty">No exercises found. Try another search.</div>}

        <div className="routine-builder-results">
          {exercises.map((exercise) => {
            const isSelected = selectedIds.has(exercise.id)
            return (
              <button
                className="routine-builder-result"
                type="button"
                key={exercise.id}
                onClick={() => addExercise(exercise)}
                disabled={isSelected}
                aria-label={`${isSelected ? 'Added' : 'Add'} ${exercise.name}`}
              >
                {exercise.images[0]
                  ? <img src={exercise.images[0]} alt="" />
                  : <div className="routine-builder-result-art" aria-hidden="true"><Plus size={17} /></div>}
                <span>{exercise.name}</span>
                {isSelected ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </section>

      <section className="routine-builder-selected" aria-label="Selected routine exercises">
        {selectedExercises.map((exercise, index) => (
          <article className="card routine-exercise-config" key={exercise.exercise_id}>
            <div className="routine-exercise-config-header">
              <h3>{index + 1}. {exercise.name}</h3>
              <button
                className="routine-remove-exercise"
                type="button"
                aria-label={`Remove ${exercise.name}`}
                onClick={() => setSelectedExercises((current) => current.filter((item) => item.exercise_id !== exercise.exercise_id))}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="routine-exercise-config-grid">
              <label>Sets
                <input type="number" min="1" max="30" value={exercise.target_sets} onChange={(event) => updateExercise(index, 'target_sets', Number(event.target.value))} />
              </label>
              <label>Reps
                <input type="number" min="1" max="30" value={exercise.target_reps} onChange={(event) => updateExercise(index, 'target_reps', Number(event.target.value))} />
              </label>
            </div>
          </article>
        ))}
        {selectedExercises.length === 0 && <div className="routine-builder-empty">Add at least one exercise to start building your routine.</div>}
      </section>

      {error && <p className="routine-builder-error" role="alert">{error}</p>}
      <div className="routine-builder-footer">
        <button className="secondary-action" type="button" onClick={() => navigate('/workouts')}>Cancel</button>
        <button className="primary-button routine-builder-submit" type="button" onClick={saveRoutine} disabled={!canSave}>
          {isSaving ? 'Saving...' : 'Save Routine'} {!isSaving && <Sparkles size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

export default CreateRoutine
