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

export interface Exercise {
  id: string
  wger_id?: number | null
  name: string
  name_es?: string | null
  category: string
  description?: string | null
  muscles: string[]
  muscles_secondary: string[]
  equipment: string[]
  aliases: string[]
  images: string[]
  muscle_images: string[]
}

export interface ExerciseListResponse {
  items: Exercise[]
  total: number
  page: number
  limit: number
}

