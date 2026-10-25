import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, GripVertical, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SelectExerciseModal } from '../components/layout/SelectExerciseModal'
import PremiumUpsellButton from '../components/premium/PremiumUpsellButton'
import { createRoutine, updateRoutine } from '../services/api'
import type { Exercise } from '../types'
import type { Routine } from '../types/workout'

type RoutineExerciseDraft = {
  exercise_id: string
  name: string
  target_sets: number
  target_reps: number
  reps_by_set: number[]
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
  const [selectedExercises, setSelectedExercises] = useState<RoutineExerciseDraft[]>(() =>
    routineToEdit?.exercises.map((exercise) => ({
      exercise_id: exercise.exercise_id,
      name: exercise.name,
      target_sets: exercise.target_sets ?? 3,
      target_reps: exercise.target_reps ?? 10,
      reps_by_set: exercise.reps_by_set?.length === (exercise.target_sets ?? 3)
        ? [...exercise.reps_by_set]
        : Array.from({ length: exercise.target_sets ?? 3 }, () => exercise.target_reps ?? 10),
    })) ?? [])
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false)
  const [replacementIndex, setReplacementIndex] = useState<number | null>(null)
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    if (successMessage) successDialogRef.current?.focus()
  }, [successMessage])

  function addExercise(exercise: Exercise) {
    setSelectedExercises((current) => current.some((item) =>
      item.exercise_id === exercise.id || normalizeExerciseName(item.name) === normalizeExerciseName(exercise.name))
      ? current
      : [...current, {
        exercise_id: exercise.id,
        name: exercise.name,
        target_sets: 3,
        target_reps: 10,
        reps_by_set: [10, 10, 10],
      }])
  }

  function selectExercise(exercise: Exercise) {
    if (replacementIndex === null) {
      addExercise(exercise)
      return
    }

    setSelectedExercises((current) => current.map((selected, index) =>
      index === replacementIndex
        ? { ...selected, exercise_id: exercise.id, name: exercise.name }
        : selected))
    setReplacementIndex(null)
  }

  function updateSetCount(index: number, value: number) {
    const safeValue = Math.min(30, Math.max(1, value || 1))
    setSelectedExercises((current) => current.map((exercise, exerciseIndex) =>
      exerciseIndex === index
        ? {
          ...exercise,
          target_sets: safeValue,
          reps_by_set: Array.from({ length: safeValue }, (_, setIndex) =>
            exercise.reps_by_set[setIndex] ?? exercise.reps_by_set[exercise.reps_by_set.length - 1] ?? exercise.target_reps),
        }
        : exercise))
  }

  function updateSetReps(index: number, setIndex: number, value: number) {
    const safeValue = Math.min(30, Math.max(1, value || 1))
    setSelectedExercises((current) => current.map((exercise, exerciseIndex) =>
      exerciseIndex === index
        ? {
          ...exercise,
          target_reps: setIndex === 0 ? safeValue : exercise.target_reps,
          reps_by_set: exercise.reps_by_set.map((reps, currentSetIndex) =>
            currentSetIndex === setIndex ? safeValue : reps),
        }
        : exercise))
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
        exercises: selectedExercises.map(({ exercise_id, target_sets, target_reps, reps_by_set }) => ({
          exercise_id,
          target_sets,
          target_reps,
          reps_by_set,
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

  const canSave = selectedExercises.length > 0 && !isSaving

  return (
    <div className="screen routine-builder-screen">
      <header className="routine-builder-header">
        <button className="icon-button" type="button" onClick={() => navigate('/workouts')} aria-label="Back to workouts">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div><p className="eyebrow">{routineToEdit ? 'Update your training plan' : 'Build your training plan'}</p><h1>{routineToEdit ? 'Edit Routine' : 'Create Routine'}</h1></div>
        <PremiumUpsellButton compact />
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
          <button
            className="secondary-action"
            type="button"
            aria-haspopup="dialog"
            onClick={() => setIsExercisePickerOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Add Exercise
          </button>
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
                  className="routine-reorder-button"
                  type="button"
                  aria-label={`Replace ${exercise.name}`}
                  onClick={() => {
                    setReplacementIndex(index)
                    setIsExercisePickerOpen(true)
                  }}
                >
                  <RefreshCw size={16} aria-hidden="true" />
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
            <div className="routine-target-table">
              <div className="set-row set-heading routine-target-heading" aria-hidden="true"><span>SETS</span><span>REPS</span><span /></div>
              {Array.from({ length: exercise.target_sets }, (_, setIndex) => (
                <div className="set-row routine-target-row" key={setIndex}>
                  <span className="routine-target-number">{setIndex + 1}</span>
                  <input
                    aria-label={`Target reps for ${exercise.name}, set ${setIndex + 1}`}
                    type="number"
                    min="1"
                    max="30"
                    value={exercise.reps_by_set[setIndex]}
                    onChange={(event) => updateSetReps(index, setIndex, Number(event.target.value))}
                  />
                  <button
                    className="routine-target-remove"
                    type="button"
                    aria-label={`Remove set ${setIndex + 1} from ${exercise.name}`}
                    disabled={exercise.target_sets <= 1}
                    onClick={() => updateSetCount(index, exercise.target_sets - 1)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                className="secondary-action routine-target-add"
                type="button"
                onClick={() => updateSetCount(index, exercise.target_sets + 1)}
                disabled={exercise.target_sets >= 30}
              >
                <Plus size={16} aria-hidden="true" /> Add Set
              </button>
            </div>
          </article>
        ))}
        {selectedExercises.length === 0 && <div className="routine-builder-empty routine-builder-empty-error">Add at least one exercise to start building your routine.</div>}
      </section>

      {error && <p className="routine-builder-error" role="alert">{error}</p>}
      <SelectExerciseModal
        isOpen={isExercisePickerOpen}
        onClose={() => {
          setIsExercisePickerOpen(false)
          setReplacementIndex(null)
        }}
        onSelectExercise={selectExercise}
        excludedExerciseIds={selectedExercises.filter((_, index) => index !== replacementIndex).map((exercise) => exercise.exercise_id)}
        excludedExerciseNames={selectedExercises.filter((_, index) => index !== replacementIndex).map((exercise) => exercise.name)}
      />
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
