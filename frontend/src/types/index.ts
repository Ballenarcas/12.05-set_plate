export interface MacroSummary {
  label: string
  consumed: number
  goal: number
  unit: 'g' | 'kcal'
}

export interface WorkoutSummary {
  title: string
  exerciseCount: number
  durationMinutes: number
}
