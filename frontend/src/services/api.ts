// In development, send API requests through Vite so LAN devices use the
// computer hosting the frontend instead of their own localhost.
const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '')
const REQUEST_TIMEOUT_MS = 5000
const dashboardRequests = new Map<string, Promise<DashboardSummary>>()
const DASHBOARD_CACHE_PREFIX = 'set_plate_dashboard:'
const DASHBOARD_CACHE_TTL_MS = 30_000
const insightRequests = new Map<string, Promise<TrainerInsightResponse>>()
import type { Routine, RoutineCreatePayload, WorkoutHistoryEntry } from '../types/workout'
import type { WorkoutLogCreate } from '../types/workout'

export interface DashboardSummary {
  user_name: string
  current_date_formatted: string
  ai_notification: string
  nutrition: {
    remaining_kcals: number
    target_kcals: number
    current_protein: number
    target_protein: number
    current_carbs: number
    target_carbs: number
    current_fat: number
    target_fat: number
  }
  workout: {
    title: string
    exercise_count: number
    estimated_duration_minutes: number
  } | null
}

function readDashboardCache(userId: string): { data: DashboardSummary; at: number } | null {
  try {
    const saved = sessionStorage.getItem(`${DASHBOARD_CACHE_PREFIX}${userId}`)
    if (!saved) return null
    const cached = JSON.parse(saved) as { data: DashboardSummary; at: number }
    return cached?.data && typeof cached.at === 'number' ? cached : null
  } catch {
    return null
  }
}

export function clearDashboardCache(): void {
  dashboardRequests.clear()
}

export function getCachedDashboardSummary(): DashboardSummary | null {
  const user = getCurrentUser()
  return user?.id ? readDashboardCache(user.id)?.data ?? null : null
}

export async function fetchDashboardSummary(options: { forceRefresh?: boolean } = {}): Promise<DashboardSummary> {
  const user = getCurrentUser()
  if (!user?.id) throw new Error('Complete onboarding before loading the dashboard')
  const userId = user.id
  const cached = readDashboardCache(userId)
  if (!options.forceRefresh && cached && Date.now() - cached.at < DASHBOARD_CACHE_TTL_MS) return cached.data
  const inflight = dashboardRequests.get(userId)
  if (inflight) return inflight

  const request = fetch(`${API_URL}/api/v1/dashboard/summary?user_id=${encodeURIComponent(userId)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to load dashboard summary')
      const data = await response.json() as DashboardSummary
      try {
        sessionStorage.setItem(`${DASHBOARD_CACHE_PREFIX}${userId}`, JSON.stringify({ data, at: Date.now() }))
      } catch {
        // The fresh response remains usable when browser storage is unavailable.
      }
      return data
    })
    .finally(() => {
      dashboardRequests.delete(userId)
    })

  dashboardRequests.set(userId, request)
  return request
}

let routinesRequest: Promise<Routine[]> | null = null

export function clearRoutinesCache(): void {
  routinesRequest = null
}

export async function fetchRoutines(): Promise<Routine[]> {
  if (routinesRequest) return routinesRequest
  const user = getCurrentUser()
  if (!user?.id) throw new Error('Complete onboarding before loading routines')
  routinesRequest = fetch(`${API_URL}/api/v1/routines?user_id=${encodeURIComponent(user.id)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to load routines')
      return response.json() as Promise<Routine[]>
    })
    .catch((error: unknown) => {
      routinesRequest = null
      throw error
    })
  return routinesRequest
}

export async function createRoutine(payload: RoutineCreatePayload): Promise<Routine> {
  const user = getCurrentUser()
  if (!user?.id) throw new Error('Complete onboarding before creating a routine')

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/v1/routines?user_id=${encodeURIComponent(user.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('The request timed out while saving the routine. Please try again.', { cause: error })
    }
    if (error instanceof TypeError) {
      throw new Error(`Could not reach the server while saving the routine: ${error.message}`, { cause: error })
    }
    throw error
  }

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null)
    let detail: string | undefined
    if (error && typeof error === 'object' && 'detail' in error) {
      const responseDetail = error.detail
      if (typeof responseDetail === 'string') {
        detail = responseDetail
      } else if (Array.isArray(responseDetail)) {
        detail = responseDetail
          .map((item: unknown) => {
            if (!item || typeof item !== 'object' || !('msg' in item)) return null
            const message = typeof item.msg === 'string' ? item.msg : null
            const location = 'loc' in item && Array.isArray(item.loc)
              ? item.loc.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number').join(' > ')
              : ''
            return message ? `${location ? `${location}: ` : ''}${message}` : null
          })
          .filter((message): message is string => message !== null)
          .join('; ')
      }
    }
    throw new Error(detail || `Unable to create routine (server error ${response.status})`)
  }
  const routine = await response.json() as Routine
  clearRoutinesCache()
  return routine
}

export async function updateRoutine(routineId: string, payload: RoutineCreatePayload): Promise<Routine> {
  const user = getCurrentUser()
  if (!user?.id) throw new Error('Complete onboarding before updating a routine')

  const response = await fetch(
    `${API_URL}/api/v1/routines/${encodeURIComponent(routineId)}?user_id=${encodeURIComponent(user.id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null)
    const detail = error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string'
      ? error.detail
      : `Unable to update routine (server error ${response.status})`
    throw new Error(detail)
  }
  const routine = await response.json() as Routine
  clearRoutinesCache()
  return routine
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const user = getCurrentUser()
  if (!user?.id) throw new Error('Complete onboarding before deleting a routine')

  const response = await fetch(
    `${API_URL}/api/v1/routines/${encodeURIComponent(routineId)}?user_id=${encodeURIComponent(user.id)}`,
    { method: 'DELETE', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  )
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null)
    const detail = error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string'
      ? error.detail
      : `Unable to delete routine (server error ${response.status})`
    throw new Error(detail)
  }
  clearRoutinesCache()
}

export async function saveWorkoutLog(userId: string, payload: WorkoutLogCreate): Promise<{ id: string; status: string }> {
  const response = await fetch(`${API_URL}/api/v1/workouts/logs?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || 'Unable to save workout')
  }
  return response.json() as Promise<{ id: string; status: string }>
}

export async function fetchWorkoutHistory(userId: string): Promise<WorkoutHistoryEntry[]> {
  const query = new URLSearchParams({ user_id: userId, limit: '30' })
  const response = await fetch(`${API_URL}/api/v1/workouts/history?${query}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || 'Unable to load workout history')
  }
  const result = await response.json() as { items: WorkoutHistoryEntry[] }
  return result.items
}

export async function deleteWorkoutHistoryEntry(userId: string, workoutId: string): Promise<void> {
  const query = new URLSearchParams({ user_id: userId })
  const response = await fetch(`${API_URL}/api/v1/workouts/history/${encodeURIComponent(workoutId)}?${query}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || 'Unable to delete workout history entry')
  }
}

export async function loginUser(email: string, password: string): Promise<import('../types').UserProfile> {
  const response = await fetch(`${API_URL}/api/v1/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    let errorMessage = `Server error (${response.status})`
    try {
      const errorData = await response.json()
      if (typeof errorData.detail === 'string') errorMessage = errorData.detail
    } catch {
      // Keep the status-based error when the server response is not JSON.
    }
    throw new Error(errorMessage)
  }

  const profile = await response.json() as import('../types').UserProfile
  try {
    localStorage.setItem('set_plate_user', JSON.stringify(profile))
  } catch {
    throw new Error('Could not save the signed-in profile in this browser')
  }
  return profile
}

export interface TrainerInsightRequest {
  nutrition_summary: string
  training_summary: string
  user_goal: string
}

export interface TrainerInsightResponse {
  insight: string
  model: string
}

export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_URL}/api/v1/health`)
  if (!response.ok) throw new Error('Unable to reach SET&PLATE API')
  return response.json() as Promise<{ status: string }>
}

export async function generateTrainerInsight(
  request: TrainerInsightRequest,
): Promise<TrainerInsightResponse> {
  const requestKey = JSON.stringify(request)
  const existingRequest = insightRequests.get(requestKey)
  if (existingRequest) return existingRequest

  const insightRequest = fetch(`${API_URL}/api/v1/ai/trainer-insight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestKey,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to generate trainer insight')
      return response.json() as Promise<TrainerInsightResponse>
    })
    .finally(() => insightRequests.delete(requestKey))

  insightRequests.set(requestKey, insightRequest)
  return insightRequest
}

export type EntityType = 'food' | 'exercise' | 'routine' | 'meal'

export interface MatchedEntity {
  id: string
  name: string
  category: EntityType
  score: number
  matched_term: string
  metadata: Record<string, unknown>
}

export interface ParseNaturalLanguageResponse {
  original_text: string
  detected_intent: string
  foods: MatchedEntity[]
  exercises: MatchedEntity[]
  routines: MatchedEntity[]
  meals: MatchedEntity[]
}

export interface ConversationalSetupRequest {
  message: string
  conversation_history?: Array<{ role: string; content: string }>
}

export interface ConversationalSetupResponse {
  reply: string
  detected_intent: string
  matched_entities: ParseNaturalLanguageResponse
}

export async function parseNaturalLanguage(
  text: string,
  threshold = 0.65,
): Promise<ParseNaturalLanguageResponse> {
  const response = await fetch(`${API_URL}/api/v1/ai/parse-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, threshold }),
  })
  if (!response.ok) throw new Error('Failed to parse natural language')
  return response.json() as Promise<ParseNaturalLanguageResponse>
}

export async function conversationalSetup(
  request: ConversationalSetupRequest,
): Promise<ConversationalSetupResponse> {
  const response = await fetch(`${API_URL}/api/v1/ai/conversational-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error('Conversational setup request failed')
  return response.json() as Promise<ConversationalSetupResponse>
}

export interface FetchExercisesParams {
  q?: string
  category?: string
  muscle_group?: string
  muscle?: string
  equipment?: string
  page?: number
  limit?: number
  compact?: boolean
}

const exerciseListCache = new Map<string, { at: number; data: import('../types').ExerciseListResponse }>()
const exerciseListInflight = new Map<string, Promise<import('../types').ExerciseListResponse>>()
const EXERCISE_LIST_TTL_MS = 30_000

export async function fetchExercises(params: FetchExercisesParams = {}) {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.category) query.set('category', params.category)
  if (params.muscle_group) query.set('muscle_group', params.muscle_group)
  if (params.muscle) query.set('muscle', params.muscle)
  if (params.equipment) query.set('equipment', params.equipment)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.compact) query.set('compact', 'true')

  const queryString = query.toString()
  const cached = exerciseListCache.get(queryString)
  if (cached && Date.now() - cached.at < EXERCISE_LIST_TTL_MS) return cached.data
  const inflight = exerciseListInflight.get(queryString)
  if (inflight) return inflight

  const request = fetch(`${API_URL}/api/v1/workouts/exercises${queryString ? `?${queryString}` : ''}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Failed to fetch exercises')
      const data = (await response.json()) as import('../types').ExerciseListResponse
      exerciseListCache.set(queryString, { at: Date.now(), data })
      return data
    })
    .finally(() => {
      exerciseListInflight.delete(queryString)
    })

  exerciseListInflight.set(queryString, request)
  return request
}

export async function fetchExerciseCategories(): Promise<string[]> {
  const response = await fetch(`${API_URL}/api/v1/workouts/exercises/categories`)
  if (!response.ok) throw new Error('Failed to fetch categories')
  const data = await response.json()
  return data.categories ?? []
}

export async function fetchExerciseMuscleGroups(): Promise<string[]> {
  const response = await fetch(`${API_URL}/api/v1/workouts/exercises/muscle-groups`)
  if (!response.ok) throw new Error('Failed to fetch exercise muscle groups')
  const data = await response.json() as { muscle_groups: string[] }
  return data.muscle_groups
}

export async function fetchExerciseById(exerciseId: string) {
  const response = await fetch(`${API_URL}/api/v1/workouts/exercises/${exerciseId}`)
  if (!response.ok) throw new Error(`Failed to fetch exercise ${exerciseId}`)
  return response.json()
}

export async function triggerWgerImport(maxItems?: number) {
  const url = maxItems
    ? `${API_URL}/api/v1/workouts/exercises/import-wger?max_items=${maxItems}`
    : `${API_URL}/api/v1/workouts/exercises/import-wger`
  const response = await fetch(url, { method: 'POST' })
  if (!response.ok) throw new Error('Failed to import exercises from wger')
  return response.json()
}

export function calculateAgeFromBirthDate(birthDate: string): number | undefined {
  if (!birthDate) return undefined
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return undefined
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age >= 0 ? age : undefined
}

export async function submitUserOnboarding(formData: import('../types').UserOnboardingFormData): Promise<import('../types').UserProfile> {
  const calculatedAge = calculateAgeFromBirthDate(formData.birthDate)
  const ageInt = calculatedAge !== undefined ? Math.floor(calculatedAge) : undefined

  const payload = {
    name: formData.firstName.trim(),
    surname: formData.lastName.trim(),
    email: formData.email.trim(),
    password: formData.password,
    age: ageInt,
    gender: formData.gender,
    weight: formData.weight ? parseFloat(formData.weight) : undefined,
    height: formData.height ? parseInt(formData.height, 10) : undefined,
    objective: formData.mainGoal,
  }

  const localProfile: import('../types').UserProfile = {
    name: payload.name,
    surname: payload.surname,
    email: payload.email,
    birthDate: formData.birthDate,
    age: calculatedAge,
    gender: payload.gender,
    weight: payload.weight,
    height: payload.height,
    objective: payload.objective,
  }

  try {
    localStorage.setItem('set_plate_user', JSON.stringify(localProfile))
  } catch {
    // Ignore storage errors in restricted contexts
  }

  const response = await fetch(`${API_URL}/api/v1/users/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let errorMsg = `Server error (${response.status})`
    try {
      const errorData = await response.json()
      if (errorData.detail) errorMsg = errorData.detail
    } catch {
      // Ignore json parse error
    }
    throw new Error(errorMsg)
  }

  const data = await response.json()
  if (!data.saved_to_supabase) {
    throw new Error('User was not saved to database. Please try again.')
  }

  localProfile.id = data.user_id
  if (data.calorie_goal) {
    localProfile.calorie_goal = data.calorie_goal
  }
  try {
    localStorage.setItem('set_plate_user', JSON.stringify(localProfile))
  } catch {
    // Ignore
  }

  return localProfile
}

export function getCurrentUser(): import('../types').UserProfile | null {
  try {
    const saved = localStorage.getItem('set_plate_user')
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

export async function updateUserSettings(
  userId: string,
  settings: { age: number; weight: number; height: number; gender: string; objective: string },
): Promise<void> {
  const query = new URLSearchParams({ user_id: userId })
  const response = await fetch(`${API_URL}/api/v1/settings/update?${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || `Unable to save settings (${response.status})`)
  }

  try {
    const user = getCurrentUser()
    if (user?.id === userId) {
      localStorage.setItem('set_plate_user', JSON.stringify({ ...user, ...settings }))
    }
    sessionStorage.removeItem(`${DASHBOARD_CACHE_PREFIX}${userId}`)
  } catch {
    // The saved server response remains authoritative if browser storage is unavailable.
  }
  clearDashboardCache()
}

export interface MealLogItem {
  id: string
  user_id: string
  meal_name: string
  meal_type: string
  portion_amount: string
  weight_g: string
  item_calories: number
  consumed_at?: string
  proteins_g?: number
  carbs_g?: number
  fats_g?: number
}

export interface TodayNutritionData {
  consumed_calories: number
  daily_goal: number
  active_calories: number
  calories_progress_percentage: number
  carbs_g: number
  proteins_g: number
  fats_g: number
  meals: MealLogItem[]
}

export async function fetchTodayNutrition(userId: string): Promise<TodayNutritionData> {
  const response = await fetch(`${API_URL}/api/v1/nutrition/today?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) {
    throw new Error('Failed to fetch today nutrition from database')
  }
  return response.json()
}

export interface FoodSearchItem {
  id: string
  name: string
  calories_per_100g: number
  proteins_per_100g: number
  carbs_per_100g: number
  fats_per_100g: number
  category?: string
}

export async function searchFoodItems(query = ''): Promise<FoodSearchItem[]> {
  const response = await fetch(`${API_URL}/api/v1/nutrition/search-foods?q=${encodeURIComponent(query)}`)
  if (!response.ok) {
    throw new Error(`Food search unavailable (${response.status}). Try again.`)
  }
  return response.json()
}

export interface MealCreateRequest {
  user_id: string
  name: string
  calories?: number
  quantity_g?: number
  meal_type?: string
  proteins?: number
  carbs?: number
  fats?: number
}

export async function addMealLog(payload: MealCreateRequest): Promise<MealLogItem> {
  const response = await fetch(`${API_URL}/api/v1/nutrition/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || 'Failed to save meal to database')
  }
  clearDashboardCache()
  return response.json()
}

export async function deleteMealLog(mealId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/nutrition/meals/${mealId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete meal from database')
  }
  clearDashboardCache()
}
