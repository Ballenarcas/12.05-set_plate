type HistorySet = { set_number: number; reps: number; weight_kg: number; is_completed: boolean }
type HistoryWorkout = { started_at: string; exercises: Array<{ exercise_id: string; sets: HistorySet[] }> }

export type LastLift = { weight_kg: number; reps: number }

/** For each exercise, the weight and reps of its last completed weighted set in the most recent workout that has one. */
export function lastLifts(history: HistoryWorkout[]): Map<string, LastLift> {
  const lifts = new Map<string, LastLift>()
  const newestFirst = [...history].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
  for (const workout of newestFirst) {
    for (const exercise of workout.exercises) {
      if (lifts.has(exercise.exercise_id)) continue
      const done = exercise.sets
        .filter((set) => set.is_completed && set.weight_kg > 0)
        .sort((a, b) => a.set_number - b.set_number)
      const last = done[done.length - 1]
      if (last) lifts.set(exercise.exercise_id, { weight_kg: last.weight_kg, reps: last.reps })
    }
  }
  return lifts
}
