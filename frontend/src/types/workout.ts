export interface RoutineExercise {
  exercise_id: string
  name: string
  target_sets: number | null
  target_reps: number | null
}

export interface Routine {
  id: string
  name: string
  exercises: RoutineExercise[]
  estimated_duration_minutes: number | null
}

export interface WorkoutSet {
  set_number: number
  weight_kg: number
  reps: number
  is_completed: boolean
}

export interface ActiveExercise {
  exercise_id: string
  name: string
  previous_weight_kg: number | null
  previous_reps: number | null
  sets: WorkoutSet[]
}

export interface WorkoutLogCreate {
  routine_id?: string
  name: string
  duration_seconds: number
  started_at: string
  completed_at: string
  exercises: Array<{
    exercise_id: string
    sets: WorkoutSet[]
  }>
}
