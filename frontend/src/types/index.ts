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
  muscle_group: string
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

export type FitnessGoal = 'Lose Weight' | 'Strength' | 'Hypertrophy'

export type PremiumPlan = 'annual' | 'monthly'

export interface UserOnboardingFormData {
  // Screen 1: Authentication
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  agreedToTerms: boolean

  // Screen 2: Fitness Profile
  birthDate: string
  gender: 'Male' | 'Female' | 'Other'
  weight: string
  height: string
  mainGoal: FitnessGoal
}

export interface UserProfile {
  id?: string
  email: string
  name: string
  surname: string
  is_premium?: boolean
  premium_plan?: PremiumPlan | string | null
  premium_started_at?: string | null
  premium_expires_at?: string | null
  birthDate?: string
  age?: number
  gender?: string
  weight?: number
  height?: number
  objective?: FitnessGoal
  calorie_goal?: number
}

