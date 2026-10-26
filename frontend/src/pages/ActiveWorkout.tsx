import { ArrowDown, ArrowUp, Check, ChevronLeft, Clock3, Dumbbell, MoreVertical, Plus, Repeat2, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PremiumUpsellButton from '../components/premium/PremiumUpsellButton'
import { fetchExerciseById, fetchExercises, getCurrentUser, requestWorkoutAdjustment, saveWorkoutLog, updateWorkoutHistoryEntry } from '../services/api'
import { describeError } from '../utils/errors.js'
import type { Exercise } from '../types'
import type {
  ActiveExercise,
  ActiveSession,
  LiveWorkoutAdjustmentAction,
  LiveWorkoutAdjustmentRequest,
  LiveWorkoutAdjustmentSuggestion,
  SetKind,
  WorkoutLogCreate,
  WorkoutSet,
} from '../types/workout'
import { applyAdjustments, reindexKeyedMap } from '../utils/workoutAdjustments'

// IMPORT AJOUTÉ ICI POUR LA MODALE :
import { SelectExerciseModal } from '../components/layout/SelectExerciseModal'

const EXTREME_WEIGHT_WARNING_KG = 600
const DEFAULT_REST_SECONDS = 90
const ADJUSTMENT_ACTION_LABELS: Record<LiveWorkoutAdjustmentAction, string> = {
  reduce_load: 'Reduce the load',
  reduce_reps: 'Reduce the reps',
  drop_set: 'Turn the next set into a drop set',
  stop_exercise: 'Skip the remaining sets',
}

function describeAdjustment(suggestion: LiveWorkoutAdjustmentSuggestion): string {
  const base = ADJUSTMENT_ACTION_LABELS[suggestion.action]
  if (suggestion.action === 'reduce_load' && typeof suggestion.new_weight_kg === 'number') {
    return `${base} to ${suggestion.new_weight_kg} kg`
  }
  if (suggestion.action === 'reduce_reps' && typeof suggestion.new_reps === 'number') {
    return `${base} to ${suggestion.new_reps}`
  }
  return base
}

type AiAdjustmentState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; suggestions: LiveWorkoutAdjustmentSuggestion[]; applied: number[] }
  | { status: 'error'; message: string }
type AdjustmentUndo = {
  session: ActiveSession
  rpeValues: Record<string, number>
  restRemaining: Record<number, number>
  applied: number[]
}
type PendingSetRemoval = {
  exerciseIndex: number
  setIndex: number
  setNumber: number
  key: string
  set: WorkoutSet
  kind?: SetKind
  rpe?: number
  removed: boolean
}

function ExerciseArtwork({ name, images }: { name: string; images?: string[] }) {
  const [imageFailed, setImageFailed] = useState(false)
  const image = images?.find(Boolean)

  if (!image || imageFailed) {
    return <div className="active-exercise-artwork active-exercise-artwork-fallback" role="img" aria-label={`${name} image unavailable`}>
      <Dumbbell size={25} aria-hidden="true" />
      <span>EXERCISE</span>
    </div>
  }

  return <img className="active-exercise-artwork" src={image} alt={`${name} demonstration`} onError={() => setImageFailed(true)} />
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  if (minutes === 0) return `${remaining}s`
  return `${minutes}min ${remaining}s`
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remaining = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

function formatRest(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`
}

function swapKeyedMapIndexes<T>(map: Record<string, T>, firstIndex: number, secondIndex: number): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) {
    const [indexPart, ...rest] = key.split(':')
    const index = Number(indexPart)
    const nextIndex = index === firstIndex ? secondIndex : index === secondIndex ? firstIndex : index
    next[[nextIndex, ...rest].join(':')] = value
  }
  return next
}

function removeSetFromKeyedMap<T>(map: Record<string, T>, exerciseIndex: number, removedSetNumber: number): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) {
    const [exercisePart, setPart, ...rest] = key.split(':')
    const currentExerciseIndex = Number(exercisePart)
    const currentSetNumber = Number(setPart)
    if (currentExerciseIndex === exerciseIndex && currentSetNumber === removedSetNumber) continue
    const nextSetNumber = currentExerciseIndex === exerciseIndex && currentSetNumber > removedSetNumber
      ? currentSetNumber - 1
      : currentSetNumber
    next[[exercisePart, nextSetNumber, ...rest].join(':')] = value
  }
  return next
}

function insertSetIntoKeyedMap<T>(map: Record<string, T>, exerciseIndex: number, setNumber: number, value?: T): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, currentValue] of Object.entries(map)) {
    const [exercisePart, setPart, ...rest] = key.split(':')
    const currentExerciseIndex = Number(exercisePart)
    const currentSetNumber = Number(setPart)
    const nextSetNumber = currentExerciseIndex === exerciseIndex && currentSetNumber >= setNumber
      ? currentSetNumber + 1
      : currentSetNumber
    next[[exercisePart, nextSetNumber, ...rest].join(':')] = currentValue
  }
  if (value !== undefined) next[`${exerciseIndex}:${setNumber}`] = value
  return next
}

function createSet(setNumber: number, source?: WorkoutSet): WorkoutSet {
  return { set_number: setNumber, weight_kg: source?.weight_kg ?? 0, reps: source?.reps ?? 0, is_completed: false }
}

function nullableNumber(value: unknown, min = 0): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= min ? number : null
}

function safeNumber(value: unknown, min = 0): number {
  return nullableNumber(value, min) ?? 0
}

function safeCount(value: unknown, min = 0): number {
  return Math.trunc(safeNumber(value, min))
}

function safeSetKind(value: unknown): SetKind {
  return value === 'warmup' || value === 'drop' || value === 'failure' ? value : 'normal'
}

function useDialogBehavior(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [open])
  return dialogRef
}

function getSession(state: unknown): ActiveSession | null {
  if (!state || typeof state !== 'object' || !('name' in state) || !('exercises' in state)) return null
  const parsed = state as Partial<ActiveSession>
  return { ...parsed, setKinds: parsed.setKinds ?? {} } as ActiveSession
}

function ActiveWorkout() {
  const navigate = useNavigate()
  const location = useLocation()
  const routeSession = getSession(location.state)
  const [session, setSession] = useState<ActiveSession | null>(() => {
    if (routeSession) return routeSession
    const saved = sessionStorage.getItem('set_plate_active_workout')
    return saved ? getSession(JSON.parse(saved)) : null
  })
  const [workoutName, setWorkoutName] = useState(() => session?.name ?? '')
  const [now, setNow] = useState(() => Date.now())
  const [showFinish, setShowFinish] = useState(false)
  const [showAiAdjustment, setShowAiAdjustment] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [rpeValues, setRpeValues] = useState<Record<string, number>>({})
  const [restRemaining, setRestRemaining] = useState<Record<number, number>>({})
  const [menuOpen, setMenuOpen] = useState<number | null>(null)
  const [removingSetKey, setRemovingSetKey] = useState<string | null>(null)
  const [revealedSetKey, setRevealedSetKey] = useState<string | null>(null)
  const [pendingSetRemoval, setPendingSetRemoval] = useState<PendingSetRemoval | null>(null)
  const [aiAdjustment, setAiAdjustment] = useState<AiAdjustmentState>({ status: 'idle' })
  const [adjustmentUndo, setAdjustmentUndo] = useState<AdjustmentUndo | null>(null)

  // Modale SelectExerciseModal
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false)
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null)

  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const removeSetTimer = useRef<number | null>(null)
  const removeSetAnimationTimer = useRef<number | null>(null)
  const undoAdjustmentTimer = useRef<number | null>(null)
  const lastAdjustmentSetCount = useRef<number | null>(null)
  const imageLookups = useRef(new Set<string>())
  const sessionRef = useRef(session)

  useEffect(() => {
    sessionRef.current = session
    if (session) sessionStorage.setItem('set_plate_active_workout', JSON.stringify(session))
  }, [session])

  useEffect(() => () => {
    if (removeSetTimer.current !== null) window.clearTimeout(removeSetTimer.current)
    if (removeSetAnimationTimer.current !== null) window.clearTimeout(removeSetAnimationTimer.current)
    if (undoAdjustmentTimer.current !== null) window.clearTimeout(undoAdjustmentTimer.current)
  }, [])

  const aiAdjustmentDialogRef = useDialogBehavior(showAiAdjustment, () => setShowAiAdjustment(false))
  const finishDialogRef = useDialogBehavior(showFinish, () => setShowFinish(false))

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
      setRestRemaining((current) => {
        let changed = false
        const next: Record<number, number> = {}
        for (const [key, value] of Object.entries(current)) {
          const remaining = value > 0 ? value - 1 : 0
          if (remaining !== value) changed = true
          if (remaining > 0) next[Number(key)] = remaining
        }
        return changed ? next : current
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    session?.exercises.forEach((exercise) => {
      if (exercise.images?.length || imageLookups.current.has(exercise.exercise_id)) return
      imageLookups.current.add(exercise.exercise_id)
      fetchExerciseById(exercise.exercise_id)
        .catch(() => fetchExercises({ q: exercise.name, limit: 100 }).then((result: { items: Exercise[] }) =>
          result.items.find((item) => item.name.trim().toLowerCase() === exercise.name.trim().toLowerCase()) ?? null))
        .then((catalogExercise: Exercise | null) => {
          if (!catalogExercise) return
          if (!catalogExercise.images?.length) return
          setSession((current) => current ? ({
            ...current,
            exercises: current.exercises.map((item) => item.exercise_id === exercise.exercise_id
              ? { ...item, images: catalogExercise.images }
              : item),
          }) : current)
        })
        .catch(() => undefined)
    })
  }, [session])

  useEffect(() => {
    const pending = sessionStorage.getItem('set_plate_pending_exercise')
    if (!pending) return
    try {
      const selection = JSON.parse(pending) as Exercise & { replaceExerciseIndex?: number }
      setSession((current) => {
        if (!current) return current
        const replacement = {
          exercise_id: selection.id,
          name: selection.name,
          images: selection.images,
          previous_weight_kg: null,
          previous_reps: null,
        }
        if (selection.replaceExerciseIndex !== undefined && current.exercises[selection.replaceExerciseIndex]) {
          return {
            ...current,
            exercises: current.exercises.map((exercise, index) => index === selection.replaceExerciseIndex
              ? { ...exercise, ...replacement }
              : exercise),
          }
        }
        return { ...current, exercises: [...current.exercises, { ...replacement, sets: [createSet(1)] }] }
      })
    } finally {
      sessionStorage.removeItem('set_plate_pending_exercise')
    }
  }, [])

  const durationSeconds = useMemo(() => session ? Math.max(0, Math.floor((now - Date.parse(session.startedAt)) / 1000)) : 0, [now, session])
  const completedSets = session?.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.is_completed).length, 0) ?? 0
  const volumeKg = session?.exercises.reduce((total, exercise) => (
    total + exercise.sets.reduce((sum, set) => sum + (set.is_completed ? set.weight_kg * set.reps : 0), 0)
  ), 0) ?? 0

  if (!session) return <div className="screen state-card" role="alert">No active workout selected.</div>

  function handleSelectExercise(selected: any) {
    const replacement = {
      exercise_id: selected.id,
      name: selected.name,
      images: selected.images || [],
      previous_weight_kg: null,
      previous_reps: null,
    }

    setSession((current) => {
      if (!current) return current
      if (replaceIndex !== null && current.exercises[replaceIndex]) {
        return {
          ...current,
          exercises: current.exercises.map((ex, idx) => idx === replaceIndex ? { ...ex, ...replacement } : ex),
        }
      }
      return {
        ...current,
        exercises: [...current.exercises, { ...replacement, sets: [createSet(1)] }],
      }
    })
    setIsSelectModalOpen(false)
    setReplaceIndex(null)
  }

  function updateExercise(exerciseIndex: number, update: Partial<ActiveExercise>) {
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.map((exercise, index) => index !== exerciseIndex ? exercise : { ...exercise, ...update }),
    }) : current)
  }

  function updateSet(exerciseIndex: number, setIndex: number, update: Partial<WorkoutSet>) {
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.map((exercise, index) => index !== exerciseIndex ? exercise : ({
        ...exercise,
        sets: exercise.sets.map((set, currentIndex) => currentIndex !== setIndex ? set : { ...set, ...update }),
      })),
    }) : current)
  }

  function addSet(exerciseIndex: number) {
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.map((exercise, index) => {
        if (index !== exerciseIndex) return exercise
        const last = exercise.sets[exercise.sets.length - 1]
        return { ...exercise, sets: [...exercise.sets, createSet(exercise.sets.length + 1, last)] }
      }),
    }) : current)
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    const removedSetNumber = sessionRef.current?.exercises[exerciseIndex]?.sets[setIndex]?.set_number
    if (removedSetNumber === undefined) return
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.map((exercise, index) => index !== exerciseIndex ? exercise : ({
        ...exercise,
        sets: exercise.sets
          .filter((_, currentIndex) => currentIndex !== setIndex)
          .map((set, currentIndex) => ({ ...set, set_number: currentIndex + 1 })),
      })),
      setKinds: removeSetFromKeyedMap(current.setKinds, exerciseIndex, removedSetNumber),
    }) : current)
    setRpeValues((current) => removeSetFromKeyedMap(current, exerciseIndex, removedSetNumber))
  }

  function scheduleSetRemoval(removal: PendingSetRemoval) {
    if (removeSetTimer.current !== null) return
    setPendingSetRemoval(removal)
    setRemovingSetKey(removal.key)
    setRevealedSetKey(null)
    removeSetAnimationTimer.current = window.setTimeout(() => {
      removeSet(removal.exerciseIndex, removal.setIndex)
      setPendingSetRemoval((current) => current ? { ...current, removed: true } : current)
      setRemovingSetKey(null)
      removeSetAnimationTimer.current = null
    }, 240)
    removeSetTimer.current = window.setTimeout(() => {
      setPendingSetRemoval(null)
      removeSetTimer.current = null
    }, 2800)
  }

  function undoSetRemoval() {
    if (removeSetTimer.current !== null) window.clearTimeout(removeSetTimer.current)
    if (removeSetAnimationTimer.current !== null) window.clearTimeout(removeSetAnimationTimer.current)
    removeSetTimer.current = null
    removeSetAnimationTimer.current = null
    if (pendingSetRemoval?.removed) {
      const { exerciseIndex, setIndex, set, kind, rpe } = pendingSetRemoval
      setSession((current) => current ? ({
        ...current,
        exercises: current.exercises.map((exercise, index) => index !== exerciseIndex ? exercise : ({
          ...exercise,
          sets: [...exercise.sets.slice(0, setIndex), set, ...exercise.sets.slice(setIndex)]
            .map((currentSet, index) => ({ ...currentSet, set_number: index + 1 })),
        })),
        setKinds: insertSetIntoKeyedMap(current.setKinds, exerciseIndex, set.set_number, kind),
      }) : current)
      setRpeValues((current) => insertSetIntoKeyedMap(current, exerciseIndex, set.set_number, rpe))
    }
    setRemovingSetKey(null)
    setPendingSetRemoval(null)
  }

  function removeExercise(exerciseIndex: number) {
    if (removeSetTimer.current !== null) undoSetRemoval()
    setMenuOpen(null)
    setSession((current) => current ? ({
      ...current,
      exercises: current.exercises.filter((_, index) => index !== exerciseIndex),
      setKinds: reindexKeyedMap(current.setKinds, exerciseIndex),
    }) : current)
    setRpeValues((current) => reindexKeyedMap(current, exerciseIndex))
    setRestRemaining((current) => reindexKeyedMap(current, exerciseIndex))
  }

  function replaceExercise(exerciseIndex: number) {
    setMenuOpen(null)
    setReplaceIndex(exerciseIndex)
    setIsSelectModalOpen(true)
  }

  function moveExercise(exerciseIndex: number, direction: -1 | 1) {
    const targetIndex = exerciseIndex + direction
    if (!session || targetIndex < 0 || targetIndex >= session.exercises.length) return
    setMenuOpen(null)
    setSession((current) => {
      if (!current || targetIndex >= current.exercises.length) return current
      const exercises = [...current.exercises]
      ;[exercises[exerciseIndex], exercises[targetIndex]] = [exercises[targetIndex], exercises[exerciseIndex]]
      return { ...current, exercises, setKinds: swapKeyedMapIndexes(current.setKinds, exerciseIndex, targetIndex) }
    })
    setRpeValues((current) => swapKeyedMapIndexes(current, exerciseIndex, targetIndex))
    setRestRemaining((current) => {
      const next = { ...current }
      const firstValue = current[exerciseIndex]
      const secondValue = current[targetIndex]
      if (secondValue === undefined) delete next[exerciseIndex]
      else next[exerciseIndex] = secondValue
      if (firstValue === undefined) delete next[targetIndex]
      else next[targetIndex] = firstValue
      return next
    })
  }

  function updateSetKind(exerciseIndex: number, setNumber: number, kind: SetKind) {
    setSession((current) => current ? ({ ...current, setKinds: { ...current.setKinds, [`${exerciseIndex}:${setNumber}`]: kind } }) : current)
  }

  function updateRpe(exerciseIndex: number, setNumber: number, rpe: number) {
    const key = `${exerciseIndex}:${setNumber}`
    setRpeValues((current) => ({ ...current, [key]: rpe }))
  }

  function toggleRest(exerciseIndex: number) {
    const exercise = session?.exercises[exerciseIndex]
    if (!exercise) return
    const enable = !exercise.rest_enabled
    updateExercise(exerciseIndex, { rest_enabled: enable })
    if (!enable) {
      setRestRemaining((current) => {
        if (!(exerciseIndex in current)) return current
        const next = { ...current }
        delete next[exerciseIndex]
        return next
      })
    }
  }

  function toggleSetComplete(exerciseIndex: number, setIndex: number, isCompleted: boolean) {
    updateSet(exerciseIndex, setIndex, { is_completed: isCompleted })
    const exercise = session?.exercises[exerciseIndex]
    if (isCompleted && exercise?.rest_enabled) {
      setRestRemaining((current) => ({ ...current, [exerciseIndex]: exercise.rest_seconds ?? DEFAULT_REST_SECONDS }))
    }
  }

  function updateRestDuration(exerciseIndex: number, seconds: number) {
    updateExercise(exerciseIndex, { rest_seconds: seconds })
    setRestRemaining((current) => exerciseIndex in current ? { ...current, [exerciseIndex]: seconds } : current)
  }

  async function finishWorkout() {
    const user = getCurrentUser()
    const currentSession = session
    if (!user?.id || !currentSession) return
    setIsSaving(true)
    setSaveError(null)
    const payload: WorkoutLogCreate = {
      plan_id: currentSession.planId,
      routine_id: currentSession.routineId,
      name: workoutName.trim() || currentSession.name,
      duration_seconds: durationSeconds,
      started_at: currentSession.startedAt,
      completed_at: new Date().toISOString(),
      exercises: currentSession.exercises.map(({ exercise_id, sets }, exerciseIndex) => ({
        exercise_id,
        sets: sets.map((set) => ({
          ...set,
          rpe: rpeValues[`${exerciseIndex}:${set.set_number}`] ?? set.rpe ?? null,
        })),
      })),
    }
    try {
      if (currentSession.editWorkoutId) {
        await updateWorkoutHistoryEntry(user.id, currentSession.editWorkoutId, {
          name: payload.name,
          exercises: payload.exercises,
        })
      } else {
        await saveWorkoutLog(user.id, payload)
      }
      sessionStorage.removeItem('set_plate_active_workout')
      navigate('/workouts')
    } catch (error) {
      setSaveError(describeError(error, "We couldn't save your workout. Please try again."))
      setIsSaving(false)
    }
  }

  async function requestAiAdjustment() {
    const currentSession = session
    const user = getCurrentUser()
    if (!currentSession || aiAdjustment.status === 'loading') return
    if (!user?.id) {
      setAiAdjustment({ status: 'error', message: 'Sign in to ask the AI trainer for adjustments' })
      return
    }
    const completedAtRequest = completedSets
    const exercises = (Array.isArray(currentSession.exercises) ? currentSession.exercises : []).map((exercise, exerciseIndex) => {
      const { exercise_id, name, previous_weight_kg, previous_reps, rest_enabled, rest_seconds, target_sets, target_reps, sets } = exercise
      const previousWeight = nullableNumber(previous_weight_kg)
      const previousReps = nullableNumber(previous_reps)
      const rest = nullableNumber(rest_seconds, 1)
      const targetSets = nullableNumber(target_sets)
      const targetReps = nullableNumber(target_reps)
      return {
        exercise_id: exercise_id ? String(exercise_id) : '',
        name: typeof name === 'string' && name.trim() ? name : 'Exercise',
        previous_weight_kg: previousWeight,
        previous_reps: previousReps === null ? null : Math.trunc(previousReps),
        rest_seconds: rest_enabled ? (rest === null ? DEFAULT_REST_SECONDS : Math.trunc(rest)) : null,
        target_sets: targetSets === null ? null : Math.trunc(targetSets),
        target_reps: targetReps === null ? null : Math.trunc(targetReps),
        sets: (Array.isArray(sets) ? sets : []).map((set, setIndex) => {
          const key = `${exerciseIndex}:${set.set_number}`
          const rpe = nullableNumber(rpeValues[key], 1)
          return {
            set_number: setIndex + 1,
            weight_kg: safeNumber(set.weight_kg),
            reps: safeCount(set.reps),
            is_completed: Boolean(set.is_completed),
            rpe: rpe !== null && rpe <= 10 ? rpe : null,
            kind: safeSetKind(currentSession.setKinds[key]),
          }
        }),
      }
    }).filter((exercise) => exercise.exercise_id)
    if (!exercises.length) {
      setAiAdjustment({ status: 'error', message: 'Add at least one exercise before asking the AI for adjustments.' })
      return
    }
    setAiAdjustment({ status: 'loading' })
    const payload: LiveWorkoutAdjustmentRequest = {
      name: typeof currentSession.name === 'string' && currentSession.name.trim() ? currentSession.name : 'Workout',
      duration_seconds: Number.isFinite(durationSeconds) ? Math.max(0, Math.floor(durationSeconds)) : 0,
      user_goal: typeof user.objective === 'string' ? user.objective : null,
      exercises,
    }
    try {
      const result = await requestWorkoutAdjustment(user.id, payload)
      lastAdjustmentSetCount.current = completedAtRequest
      setAdjustmentUndo(null)
      setAiAdjustment({ status: 'ready', suggestions: result.suggestions, applied: [] })
    } catch (error) {
      setAiAdjustment({ status: 'error', message: error instanceof Error ? error.message : 'Unable to get AI adjustments' })
    }
  }

  function openAiAdjustment() {
    if (!session || session.editWorkoutId) return
    setShowAiAdjustment(true)
    const isStale = lastAdjustmentSetCount.current !== completedSets
    if (aiAdjustment.status !== 'ready' || isStale) requestAiAdjustment()
  }

  function rememberAdjustmentUndo(snapshot: AdjustmentUndo) {
    if (undoAdjustmentTimer.current !== null) window.clearTimeout(undoAdjustmentTimer.current)
    setAdjustmentUndo(snapshot)
    undoAdjustmentTimer.current = window.setTimeout(() => {
      setAdjustmentUndo(null)
      undoAdjustmentTimer.current = null
    }, 8000)
  }

  function applyOneAdjustment(index: number) {
    if (!session || aiAdjustment.status !== 'ready' || aiAdjustment.applied.includes(index)) return
    const update = aiAdjustment.suggestions[index]
    rememberAdjustmentUndo({ session, rpeValues, restRemaining, applied: aiAdjustment.applied })
    applySuggestions([update])
    setAiAdjustment({ ...aiAdjustment, applied: [...aiAdjustment.applied, index] })
  }

  function applyAllAdjustments() {
    if (!session || aiAdjustment.status !== 'ready') return
    const pending = aiAdjustment.suggestions.filter((_, index) => !aiAdjustment.applied.includes(index))
    rememberAdjustmentUndo({ session, rpeValues, restRemaining, applied: aiAdjustment.applied })
    applySuggestions(pending)
    setAiAdjustment({ ...aiAdjustment, applied: aiAdjustment.suggestions.map((_, index) => index) })
  }

  function undoAdjustment() {
    if (!adjustmentUndo || aiAdjustment.status !== 'ready') return
    if (undoAdjustmentTimer.current !== null) {
      window.clearTimeout(undoAdjustmentTimer.current)
      undoAdjustmentTimer.current = null
    }
    setSession(adjustmentUndo.session)
    setRpeValues(adjustmentUndo.rpeValues)
    setRestRemaining(adjustmentUndo.restRemaining)
    setAiAdjustment({ ...aiAdjustment, applied: adjustmentUndo.applied })
    setAdjustmentUndo(null)
  }

  function applySuggestions(updates: LiveWorkoutAdjustmentSuggestion[]) {
    const current = session
    if (!current || !updates.length) return
    const next = applyAdjustments(current, rpeValues, restRemaining, updates)
    setSession(next.session)
    setRpeValues(next.rpeValues)
    setRestRemaining(next.restRemaining)
  }

  function discardWorkout() {
    sessionStorage.removeItem('set_plate_active_workout')
    navigate('/workouts')
  }

  const isEditingWorkout = Boolean(session?.editWorkoutId)

  return (
    <div className="screen active-workout-screen">
      <header className={`active-workout-header${isEditingWorkout ? ' is-editing' : ''}`}>
        <button className="icon-button" type="button" onClick={() => navigate('/workouts')} aria-label="Back to workouts"><ChevronLeft size={22} /></button>
        <h1>{isEditingWorkout ? 'Edit Workout' : 'Log Workout'}</h1>
        {!isEditingWorkout && (
          <span className="header-clock" aria-label="Elapsed time"><Clock3 size={16} aria-hidden="true" /><span className="header-clock-label">{formatClock(durationSeconds)}</span></span>
        )}
        {!isEditingWorkout && (
          <button
            className="ai-adjust-trigger"
            type="button"
            onClick={openAiAdjustment}
            disabled={isSaving}
            aria-label="Ask AI for adjustments"
            title="Ask AI for adjustments"
          >
            <Sparkles size={16} aria-hidden="true" />
            AI
          </button>
        )}
        <PremiumUpsellButton compact />
        <button className="finish-button" type="button" onClick={() => setShowFinish(true)}>{isEditingWorkout ? 'Save' : 'Finish'}</button>
      </header>

      <section className="session-stats" aria-label="Workout stats">
        <div><span>Duration</span><strong>{formatDuration(durationSeconds)}</strong></div>
        <div><span>Volume</span><strong>{Math.round(volumeKg).toLocaleString()} kg</strong></div>
        <div><span>Sets</span><strong>{completedSets}</strong></div>
      </section>

      <div className="active-exercise-list">
        {session.exercises.map((exercise, exerciseIndex) => (
          <article className="card exercise-card" key={`${exercise.exercise_id}-${exerciseIndex}`}>
            <button className="icon-button ghost exercise-menu-trigger" type="button" aria-label={`Exercise options for ${exercise.name}`} aria-expanded={menuOpen === exerciseIndex} onClick={() => setMenuOpen(menuOpen === exerciseIndex ? null : exerciseIndex)}>
              <MoreVertical size={19} aria-hidden="true" />
            </button>
            {menuOpen === exerciseIndex && <div className="exercise-menu">
              <button className="exercise-order-action" type="button" onClick={() => moveExercise(exerciseIndex, -1)} disabled={exerciseIndex === 0}><ArrowUp size={15} aria-hidden="true" />Move up</button>
              <button className="exercise-order-action" type="button" onClick={() => moveExercise(exerciseIndex, 1)} disabled={exerciseIndex === session.exercises.length - 1}><ArrowDown size={15} aria-hidden="true" />Move down</button>
              <button className="replace-exercise-action" type="button" onClick={() => replaceExercise(exerciseIndex)}><Repeat2 size={15} aria-hidden="true" />Replace exercise</button>
              <button type="button" onClick={() => removeExercise(exerciseIndex)}><Trash2 size={15} aria-hidden="true" />Remove exercise</button>
            </div>}
            <div className="exercise-card-header">
              <div className="exercise-heading-main"><ExerciseArtwork name={exercise.name} images={exercise.images} /><h2>{exercise.name}</h2></div>
            </div>
            <div className="rest-controls">
              <button className={`rest-toggle${exercise.rest_enabled ? ' is-on' : ''}`} type="button" aria-pressed={Boolean(exercise.rest_enabled)} onClick={() => toggleRest(exerciseIndex)}>
                <Clock3 size={15} aria-hidden="true" />
                {restRemaining[exerciseIndex] ? `Rest ${formatRest(restRemaining[exerciseIndex])}` : `Rest timer ${exercise.rest_enabled ? 'on' : 'off'}`}
              </button>
              <label className="rest-duration-field">
                <span>seconds</span>
                <input
                  className="rest-duration-input"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  aria-label={`Rest duration in seconds for ${exercise.name}`}
                  value={exercise.rest_seconds ?? DEFAULT_REST_SECONDS}
                  onChange={(event) => {
                    const seconds = Number(event.target.value)
                    if (Number.isInteger(seconds) && seconds > 0) updateRestDuration(exerciseIndex, seconds)
                  }}
                />
              </label>
            </div>
            <div className="set-table">
              <div className="set-row set-heading" aria-hidden="true"><span>SET</span><span>LAST</span><span>KG</span><span>REPS</span><span>RPE</span><span /></div>
              {exercise.sets.map((set, setIndex) => {
                const setKey = `${exerciseIndex}:${set.set_number}`
                const kind = session.setKinds[setKey] ?? 'normal'
                const isRemoving = removingSetKey === setKey
                const hasHighWeightWarning = set.weight_kg > EXTREME_WEIGHT_WARNING_KG
                return <div className="set-row-entry" key={set.set_number}>
                  <div className={`set-row-group${isRemoving ? ' is-removing' : ''}`}>
                  <div
                    className={`set-row-shell${revealedSetKey === setKey ? ' is-revealed' : ''}`}
                    onTouchStart={(event) => {
                      const touch = event.touches[0]
                      swipeStart.current = touch && !pendingSetRemoval ? { x: touch.clientX, y: touch.clientY } : null
                    }}
                    onTouchEnd={(event) => {
                      const touch = event.changedTouches[0]
                      if (swipeStart.current && touch) {
                        const deltaX = touch.clientX - swipeStart.current.x
                        const deltaY = touch.clientY - swipeStart.current.y
                        if (deltaX < -55 && Math.abs(deltaY) < 60) setRevealedSetKey(setKey)
                        else if (deltaX > 45) setRevealedSetKey(null)
                      }
                      swipeStart.current = null
                    }}
                  >
                    <button className="set-delete-action" type="button" onClick={() => scheduleSetRemoval({ exerciseIndex, setIndex, setNumber: set.set_number, key: setKey, set: { ...set }, kind: session.setKinds[setKey], rpe: rpeValues[setKey], removed: false })} aria-label={`Delete set ${set.set_number}`} disabled={pendingSetRemoval !== null}>
                      <Trash2 size={19} aria-hidden="true" />
                    </button>
                    <div className={`set-row${set.is_completed ? ' set-row-complete' : ''}`}>
                      <select className={`set-kind-select set-kind-${kind}`} value={kind} onChange={(event) => {
                        updateSetKind(exerciseIndex, set.set_number, event.target.value as SetKind)
                      }} aria-label={`Set ${set.set_number} type`} title="Set type">
                        <option value="normal">{set.set_number} — Normal set</option>
                        <option value="warmup">W — Warm-up: prepare for heavier sets</option>
                        <option value="drop">D — Drop set: lower weight, keep going</option>
                        <option value="failure">F — Failure: no more good-form reps</option>
                      </select>
                      <span className="previous-cell">{exercise.previous_weight_kg !== null ? `${exercise.previous_weight_kg}kg x ${exercise.previous_reps}` : '-'}</span>
                      <input aria-label={`${exercise.name} set ${set.set_number} weight`} type="number" min="0" step="0.5" value={set.weight_kg || ''} onChange={(event) => updateSet(exerciseIndex, setIndex, { weight_kg: Number(event.target.value) })} />
                      <input aria-label={`${exercise.name} set ${set.set_number} reps`} type="number" min="0" step="1" value={set.reps || ''} onChange={(event) => updateSet(exerciseIndex, setIndex, { reps: Number(event.target.value) })} />
                      <select className="rpe-select" aria-label={`Set ${set.set_number} RPE`} value={rpeValues[setKey] ?? ''} onChange={(event) => {
                        const rpe = Number(event.target.value)
                        if (!rpe) return
                        updateRpe(exerciseIndex, set.set_number, rpe)
                        if (!set.is_completed) toggleSetComplete(exerciseIndex, setIndex, true)
                      }}>
                        <option value="">—</option>
                        {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                      </select>
                      <button className={`done-button${set.is_completed ? ' is-done' : ''}`} type="button" onClick={() => toggleSetComplete(exerciseIndex, setIndex, !set.is_completed)} aria-label={`Toggle set ${set.set_number}`} aria-pressed={set.is_completed}><Check size={18} /></button>
                    </div>
                  </div>
                  </div>
                  {hasHighWeightWarning && <p className="high-weight-warning" role="status">⚠ This weight is extremely high. Check that you entered it correctly.</p>}
                </div>
              })}
            </div>
            {pendingSetRemoval?.exerciseIndex === exerciseIndex && <div className="set-removal-undo" role="status">
              <span>Set {pendingSetRemoval.setNumber} deleted</span>
              <button type="button" onClick={undoSetRemoval}>Undo</button>
            </div>}
            <button className="secondary-action" type="button" onClick={() => addSet(exerciseIndex)}><Plus size={16} /> Add Set</button>
          </article>
        ))}
      </div>

      <section className="add-exercise-section">
        <button 
          className="secondary-action add-exercise-button" 
          type="button" 
          onClick={() => {
            setReplaceIndex(null)
            setIsSelectModalOpen(true)
          }}
        >
          <Plus size={17} /> Add Exercise
        </button>
      </section>

      {showAiAdjustment && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAiAdjustment(false) }}>
          <div className="confirmation-modal ai-adjust-modal" role="dialog" aria-modal="true" aria-labelledby="ai-adjust-title" tabIndex={-1} ref={aiAdjustmentDialogRef}>
            <button className="modal-close" type="button" onClick={() => setShowAiAdjustment(false)} aria-label="Close"><X size={20} /></button>
            <p className="eyebrow">AI trainer</p>
            <h2 id="ai-adjust-title">Workout adjustments</h2>
            {aiAdjustment.status === 'loading'
              && <p className="ai-adjust-loading" role="status">Reviewing your sets and effort ratings...</p>}
            {aiAdjustment.status === 'ready' && (aiAdjustment.suggestions.length === 0
              ? <div className="ai-adjust-feedback"><p className="ai-adjust-result-none" role="status">No modifications suggested. Your current plan looks on track for the rest of the session.</p></div>
              : <div className="ai-adjust-result">
                  <ul>
                    {aiAdjustment.suggestions.map((suggestion, index) => {
                      const isApplied = aiAdjustment.applied.includes(index)
                      const exerciseName = session.exercises.find((exercise) => exercise.exercise_id === suggestion.exercise_id)?.name
                      return <li key={`${suggestion.exercise_id}:${suggestion.action}`} className={isApplied ? 'is-applied' : undefined}>
                        <span>{exerciseName ?? 'Exercise'}</span>
                        <p><strong>{describeAdjustment(suggestion)}.</strong> {suggestion.reason}</p>
                        {isApplied
                          ? <p className="ai-adjust-applied">Applied</p>
                          : <button className="ai-adjust-accept" type="button" onClick={() => applyOneAdjustment(index)}>Accept</button>}
                      </li>
                    })}
                  </ul>
                  {aiAdjustment.applied.length < aiAdjustment.suggestions.length
                    && <button className="ai-adjust-accept-all" type="button" onClick={applyAllAdjustments}>Accept all suggestions</button>}
                </div>)}
            {aiAdjustment.status === 'error' && <div className="ai-adjust-feedback">
              <p className="ai-adjust-error" role="alert">{aiAdjustment.message}</p>
              <button className="secondary-action" type="button" onClick={requestAiAdjustment}>Try again</button>
            </div>}
            {adjustmentUndo && <div className="set-removal-undo" role="status">
              <span>Adjustment applied</span>
              <button type="button" onClick={undoAdjustment}>Undo</button>
            </div>}
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setShowAiAdjustment(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showFinish && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowFinish(false) }}>
          <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="finish-title" tabIndex={-1} ref={finishDialogRef}>
            <button className="modal-close" type="button" onClick={() => setShowFinish(false)} aria-label="Close"><X size={20} /></button>
            <p className="eyebrow">{session?.editWorkoutId ? 'Edit workout history' : 'Session complete'}</p>
            <h2 id="finish-title">{session?.editWorkoutId ? 'Save workout changes?' : 'Finish workout?'}</h2>
            <p>{session?.editWorkoutId ? 'Your original date and duration will be kept. Changes are saved to this workout only when confirmed.' : `${formatDuration(durationSeconds)} tracked. Save your completed sets or discard this session.`}</p>
            <div className="workout-name-field">
              <label htmlFor="completed-workout-name">Workout name (e.g. Best chest day)</label>
              <input
                id="completed-workout-name"
                type="text"
                maxLength={120}
                placeholder="Best chest day"
                value={workoutName}
                onChange={(event) => setWorkoutName(event.target.value)}
                disabled={isSaving}
              />
            </div>
            {saveError && <p className="form-error">{saveError}</p>}
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setShowFinish(false)} disabled={isSaving}>Keep training</button>
              <button className="danger-action" type="button" onClick={discardWorkout} disabled={isSaving}>{session?.editWorkoutId ? 'Discard edits' : 'Discard workout'}</button>
              <button className="primary-button" type="button" onClick={finishWorkout} disabled={isSaving}>{isSaving ? 'SAVING...' : session?.editWorkoutId ? 'SAVE CHANGES' : 'SAVE WORKOUT'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up de sélection d'exercice */}
      <SelectExerciseModal
        isOpen={isSelectModalOpen}
        onClose={() => {
          setIsSelectModalOpen(false)
          setReplaceIndex(null)
        }}
        onSelectExercise={handleSelectExercise}
        onCreateCustom={() => {
          setIsSelectModalOpen(false)
          navigate('/exercises/custom')
        }}
      />
    </div>
  )
}

export default ActiveWorkout;