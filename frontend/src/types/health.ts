export type HealthConnectSource = 'health_connect' | 'preview'

export interface HealthScopes {
  steps: boolean
  active_calories: boolean
}

export interface HealthActivityDay {
  date: string
  steps: number
  active_calories: number
}

export interface HealthActivitySummary {
  connected: boolean
  source: HealthConnectSource
  steps_today: number
  active_calories_today: number
  steps_avg_7d: number
  active_calories_avg_7d: number
}

export interface HealthConnectStatus {
  connected: boolean
  provider: string
  source: HealthConnectSource
  connected_at: string | null
  last_sync_at: string | null
  scopes: HealthScopes
  activity: HealthActivitySummary
  days: HealthActivityDay[]
}
