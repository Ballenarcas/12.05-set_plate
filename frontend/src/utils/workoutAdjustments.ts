import type { ActiveSession, LiveWorkoutAdjustmentSuggestion } from '../types/workout'

export function reindexKeyedMap<T>(map: Record<string, T>, removedIndex: number): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) {
    const [indexPart, ...rest] = key.split(':')
    const index = Number(indexPart)
    if (index === removedIndex) continue
    next[[index > removedIndex ? index - 1 : index, ...rest].join(':')] = value
  }
  return next
}

function renumberExerciseKeys<T>(map: Record<string, T>, exerciseIndex: number, renames: Array<{ from: number; to: number }>): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) {
    const [exercisePart] = key.split(':')
    if (Number(exercisePart) !== exerciseIndex) next[key] = value
  }
  for (const rename of renames) {
    const value = map[`${exerciseIndex}:${rename.from}`]
    if (value !== undefined) next[`${exerciseIndex}:${rename.to}`] = value
  }
  return next
}

export function applyAdjustments(
  session: ActiveSession,
  rpeValues: Record<string, number>,
  restRemaining: Record<number, number>,
  adjustments: LiveWorkoutAdjustmentSuggestion[],
): { session: ActiveSession; rpeValues: Record<string, number>; restRemaining: Record<number, number> } {
  const exercises = [...session.exercises]
  let setKinds = { ...session.setKinds }
  let rpe = { ...rpeValues }
  let rest = { ...restRemaining }
  for (const adjustment of adjustments) {
    const exerciseIndex = exercises.findIndex((exercise) => exercise.exercise_id === adjustment.exercise_id)
    if (exerciseIndex === -1) continue
    const exercise = exercises[exerciseIndex]
    const remainingSets = exercise.sets.filter((set) => !set.is_completed)
    if (adjustment.action === 'reduce_load' && typeof adjustment.new_weight_kg === 'number') {
      const newWeightKg = adjustment.new_weight_kg
      exercises[exerciseIndex] = { ...exercise, sets: exercise.sets.map((set) => set.is_completed ? set : { ...set, weight_kg: newWeightKg }) }
    } else if (adjustment.action === 'reduce_reps' && typeof adjustment.new_reps === 'number') {
      const newReps = adjustment.new_reps
      exercises[exerciseIndex] = { ...exercise, sets: exercise.sets.map((set) => set.is_completed ? set : { ...set, reps: newReps }) }
    } else if (adjustment.action === 'drop_set') {
      const target = remainingSets[0]
      if (target) setKinds = { ...setKinds, [`${exerciseIndex}:${target.set_number}`]: 'drop' }
    } else if (adjustment.action === 'stop_exercise' && remainingSets.length) {
      const keptCompleted = exercise.sets.filter((set) => set.is_completed)
      const renames = keptCompleted.map((set, index) => ({ from: set.set_number, to: index + 1 }))
      const keptSets = keptCompleted.map((set, index) => ({ ...set, set_number: index + 1 }))
      for (const set of remainingSets) {
        const removedKey = `${exerciseIndex}:${set.set_number}`
        delete setKinds[removedKey]
        delete rpe[removedKey]
      }
      if (!keptSets.length) {
        exercises.splice(exerciseIndex, 1)
        setKinds = reindexKeyedMap(setKinds, exerciseIndex)
        rpe = reindexKeyedMap(rpe, exerciseIndex)
        rest = reindexKeyedMap(rest, exerciseIndex)
      } else {
        exercises[exerciseIndex] = { ...exercise, sets: keptSets }
        rpe = renumberExerciseKeys(rpe, exerciseIndex, renames)
      }
    }
  }
  return {
    session: { ...session, exercises, setKinds },
    rpeValues: rpe,
    restRemaining: rest,
  }
}
