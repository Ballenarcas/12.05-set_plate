import { ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, Dumbbell, GripVertical, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createRoutine, fetchExercises, fetchExerciseMuscleGroups, updateRoutine } from '../services/api'
import type { Exercise } from '../types'
import type { Routine } from '../types/workout'

type RoutineExerciseDraft = {
  exercise_id: string
  name: string
  target_sets: number
  target_reps: number
}

function normalizeExerciseName(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase()
}

function CreateRoutine() {
  const navigate = useNavigate()
  const location = useLocation()
  const routineToEdit = (location.state as { routine?: Routine } | null)?.routine
  const nameInputRef = useRef<HTMLInputElement>(null)
  const successDialogRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(routineToEdit?.name ?? '')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [exercisePage, setExercisePage] = useState(1)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [totalExercises, setTotalExercises] = useState(0)
  const [muscleGroups, setMuscleGroups] = useState<string[]>([])
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('')
  const [selectedExercises, setSelectedExercises] = useState<RoutineExerciseDraft[]>(() =>
    routineToEdit?.exercises.map((exercise) => ({
      exercise_id: exercise.exercise_id,
      name: exercise.name,
      target_sets: exercise.target_sets ?? 3,
      target_reps: exercise.target_reps ?? 10,
    })) ?? [])
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null)
  const [resolvedExerciseRequest, setResolvedExerciseRequest] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [exerciseError, setExerciseError] = useState<string | null>(null)
  const [muscleGroupError, setMuscleGroupError] = useState<string | null>(null)
  const queryKey = `${debouncedSearch}|${selectedMuscleGroup}`
  const exerciseRequestKey = `${queryKey}|${exercisePage}`
  const isLoading = resolvedExerciseRequest !== exerciseRequestKey

  useEffect(() => {
    if (successMessage) successDialogRef.current?.focus()
  }, [successMessage])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let isCurrent = true
    fetchExerciseMuscleGroups()
      .then((groups) => {
        if (isCurrent) setMuscleGroups(groups)
      })
      .catch((requestError: Error) => {
        if (isCurrent) setMuscleGroupError(requestError.message)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    let isCurrent = true
    fetchExercises({
      q: debouncedSearch || undefined,
      muscle_group: selectedMuscleGroup || undefined,
      page: exercisePage,
      limit: 6,
      compact: true,
    })
      .then((result) => {
        if (isCurrent) {
          setExercises((current) => exercisePage === 1
            ? result.items
            : [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))])
          setTotalExercises(result.total)
          setExerciseError(null)
          setResolvedExerciseRequest(exerciseRequestKey)
        }
      })
      .catch((requestError: Error) => {
        if (isCurrent) {
          setExerciseError(requestError.message)
          setResolvedExerciseRequest(exerciseRequestKey)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [debouncedSearch, selectedMuscleGroup, exercisePage, queryKey, exerciseRequestKey])

  function addExercise(exercise: Exercise) {
    setSelectedExercises((current) => current.some((item) =>
      item.exercise_id === exercise.id || normalizeExerciseName(item.name) === normalizeExerciseName(exercise.name))
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

  function moveExercise(fromIndex: number, toIndex: number) {
    setSelectedExercises((current) => {
      if (toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) return current
      const reordered = [...current]
      const [movedExercise] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, movedExercise)
      return reordered
    })
  }

  async function saveRoutine() {
    setError(null)
    setSuccessMessage(null)
    if (!name.trim()) {
      setNameError('Please enter a name for your routine.')
      nameInputRef.current?.focus()
      return
    }
    setNameError(null)
    setIsSaving(true)
    try {
      const payload = {
        name: name.trim(),
        exercises: selectedExercises.map(({ exercise_id, target_sets, target_reps }) => ({
          exercise_id,
          target_sets,
          target_reps,
        })),
      }
      if (routineToEdit) {
        await updateRoutine(routineToEdit.id, payload)
      } else {
        await createRoutine(payload)
      }
      setSuccessMessage(routineToEdit ? 'Routine updated successfully.' : 'Routine saved successfully.')
      await new Promise((resolve) => window.setTimeout(resolve, 900))
      navigate('/workouts', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save routine')
    } finally {
      setIsSaving(false)
    }
  }

  const selectedIds = new Set(selectedExercises.map((exercise) => exercise.exercise_id))
  const groupedExercises = exercises.reduce((groups, exercise) => {
    const group = exercise.muscle_group || 'Other'
    const groupExercises = groups.get(group) ?? []
    groupExercises.push(exercise)
    groups.set(group, groupExercises)
    return groups
  }, new Map<string, Exercise[]>())
  const canSave = selectedExercises.length > 0 && !isSaving

  return (
    <div className="screen routine-builder-screen">
      <header className="routine-builder-header">
        <button className="icon-button" type="button" onClick={() => navigate('/workouts')} aria-label="Back to workouts">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div><p className="eyebrow">{routineToEdit ? 'Update your training plan' : 'Build your training plan'}</p><h1>{routineToEdit ? 'Edit Routine' : 'Create Routine'}</h1></div>
      </header>

      <section className="routine-builder-intro">
        <strong>{routineToEdit ? 'Refine your training plan.' : 'Make every session count.'}</strong>
        <p>{routineToEdit ? 'Change the name, exercises, order, sets, or reps. Your existing routine will be updated.' : 'Name your routine, choose exercises, and set your target volume. You can adjust your plan any time.'}</p>
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
          <input value={search} onChange={(event) => { setSearch(event.target.value); setExercisePage(1) }} placeholder="Search the exercise library" aria-label="Search exercises" />
        </label>

        <label className="routine-muscle-group-filter">
          Muscle group
          <select value={selectedMuscleGroup} onChange={(event) => { setSelectedMuscleGroup(event.target.value); setExercisePage(1) }}>
            <option value="">All muscle groups</option>
            {muscleGroups.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </label>

        {muscleGroupError && <div className="routine-builder-error" role="alert">{muscleGroupError}</div>}
        {isLoading && <div className="card state-card" role="status">Loading exercises...</div>}
        {exerciseError && <div className="card state-card" role="alert">{exerciseError}</div>}
        {!isLoading && !exerciseError && exercises.length === 0 && <div className="routine-builder-empty">No exercises found. Try another search.</div>}

        <div
          className="routine-builder-results"
          onScroll={(event) => {
            const list = event.currentTarget
            const isNearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 48
            if (isNearBottom && !isLoading && exercises.length < totalExercises) {
              setExercisePage((current) => current + 1)
            }
          }}
          aria-label="Exercise list. Scroll to load more."
        >
          {[...groupedExercises.entries()].map(([group, groupExercises]) => (
            <section className="routine-muscle-group" key={group} aria-labelledby={`muscle-group-${group}`}>
              <h3 className="routine-muscle-group-heading" id={`muscle-group-${group}`}>
                {group}
              </h3>
              {groupExercises.map((exercise) => {
                const isSelected = selectedIds.has(exercise.id) || selectedExercises.some((item) =>
                  normalizeExerciseName(item.name) === normalizeExerciseName(exercise.name))
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
                      : <div className="routine-builder-result-art" aria-hidden="true"><Dumbbell size={18} /></div>}
                    <span>{exercise.name}</span>
                    {isSelected ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                  </button>
                )
              })}
            </section>
          ))}
          {exercises.length > 0 && <p className="routine-builder-count">
            Showing {exercises.length} of {totalExercises} exercises{isLoading ? ' · Loading…' : exercises.length < totalExercises ? ' · Scroll for more' : ''}
          </p>}
        </div>
      </section>

      <section className="routine-builder-selected" aria-label="Selected routine exercises">
        {selectedExercises.map((exercise, index) => (
          <article
            className={`card routine-exercise-config${draggedExerciseId === exercise.exercise_id ? ' is-dragging' : ''}`}
            key={exercise.exercise_id}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              const sourceId = event.dataTransfer.getData('text/plain') || draggedExerciseId
              const sourceIndex = selectedExercises.findIndex((item) => item.exercise_id === sourceId)
              moveExercise(sourceIndex, index)
              setDraggedExerciseId(null)
            }}
          >
            <div className="routine-exercise-config-header">
              <div className="routine-exercise-order">
                <span className="routine-exercise-position">{index + 1}</span>
                <button
                  className="routine-exercise-drag-handle"
                  type="button"
                  draggable
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      moveExercise(index, index - 1)
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      moveExercise(index, index + 1)
                    }
                  }}
                  aria-label={`Drag ${exercise.name} to reorder`}
                  onDragStart={(event) => {
                    setDraggedExerciseId(exercise.exercise_id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', exercise.exercise_id)
                  }}
                  onDragEnd={() => setDraggedExerciseId(null)}
                >
                  <GripVertical size={18} aria-hidden="true" />
                </button>
                <h3>{exercise.name}</h3>
              </div>
              <div className="routine-exercise-actions">
                <button className="routine-reorder-button" type="button" aria-label={`Move ${exercise.name} up`} onClick={() => moveExercise(index, index - 1)} disabled={index === 0}>
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button className="routine-reorder-button" type="button" aria-label={`Move ${exercise.name} down`} onClick={() => moveExercise(index, index + 1)} disabled={index === selectedExercises.length - 1}>
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button
                  className="routine-remove-exercise"
                  type="button"
                  aria-label={`Remove ${exercise.name}`}
                  onClick={() => setSelectedExercises((current) => current.filter((item) => item.exercise_id !== exercise.exercise_id))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
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
        {selectedExercises.length === 0 && <div className="routine-builder-empty routine-builder-empty-error">Add at least one exercise to start building your routine.</div>}
      </section>

      {error && <p className="routine-builder-error" role="alert">{error}</p>}
      {successMessage && (
        <div className="routine-save-backdrop">
          <div
            ref={successDialogRef}
            className="routine-save-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="routine-save-title"
            tabIndex={-1}
          >
            <span className="routine-save-icon"><CheckCircle2 size={34} aria-hidden="true" /></span>
            <h2 id="routine-save-title">{routineToEdit ? 'Routine updated!' : 'Routine saved!'}</h2>
            <p>{successMessage} Returning to Workouts...</p>
          </div>
        </div>
      )}
      <div className="routine-builder-footer">
        <button className="secondary-action" type="button" onClick={() => navigate('/workouts')}>Cancel</button>
        <button className="primary-button routine-builder-submit" type="button" onClick={saveRoutine} disabled={!canSave}>
          {isSaving ? 'Saving...' : routineToEdit ? 'Update Routine' : 'Save Routine'} {!isSaving && <Sparkles size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

export default CreateRoutine
