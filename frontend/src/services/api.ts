const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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
  if (!response.ok) throw new Error('Unable to reach Worki API')
  return response.json() as Promise<{ status: string }>
}

export async function generateTrainerInsight(
  request: TrainerInsightRequest,
): Promise<TrainerInsightResponse> {
  const response = await fetch(`${API_URL}/api/v1/ai/trainer-insight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) throw new Error('Unable to generate trainer insight')
  return response.json() as Promise<TrainerInsightResponse>
}
