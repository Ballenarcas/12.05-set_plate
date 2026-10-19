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

export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure'

export interface WorkoutSet {
  set_number: number
  weight_kg: number
  reps: number
  rpe?: number | null
  is_completed: boolean
}

export interface ActiveExercise {
  exercise_id: string
  name: string
  images?: string[]
  previous_weight_kg: number | null
  previous_reps: number | null
  notes?: string
  rest_enabled?: boolean
  rest_seconds?: number
  target_sets?: number | null
  target_reps?: number | null
  sets: WorkoutSet[]
}

export interface ActiveSession {
  planId?: string
  routineId?: string
  name: string
  startedAt: string
  exercises: ActiveExercise[]
  setKinds: Record<string, SetKind>
}

export interface WorkoutLogCreate {
  plan_id?: string
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

export interface WorkoutHistoryEntry {
  id: string
  routine_id: string | null
  name: string
  started_at: string
  completed_at: string | null
  duration_seconds: number
  exercises: Array<{
    exercise_id: string
    name: string
    sets: Array<{
      set_number: number
      reps: number
      weight_kg: number
      rpe: number | null
      is_completed: boolean
    }>
  }>
}

export type LiveWorkoutAdjustmentAction = 'reduce_load' | 'reduce_reps' | 'drop_set' | 'stop_exercise'

export interface LiveWorkoutAdjustmentSuggestion {
  exercise_id: string
  action: LiveWorkoutAdjustmentAction
  reason: string
  new_weight_kg?: number | null
  new_reps?: number | null
}

export interface LiveWorkoutAdjustmentRequest {
  name: string
  duration_seconds: number
  user_goal?: string | null
  exercises: Array<{
    exercise_id: string
    name: string
    previous_weight_kg: number | null
    previous_reps: number | null
    rest_seconds: number | null
    target_sets?: number | null
    target_reps?: number | null
    sets: Array<WorkoutSet & { kind: SetKind }>
  }>
}

export interface LiveWorkoutAdjustmentResponse {
  suggestions: LiveWorkoutAdjustmentSuggestion[]
}
