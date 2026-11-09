const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

/** The last 7 days, oldest first, each marked when a workout was finished that day. */
export function lastSevenDays(history: { started_at: string }[], today = new Date()) {
  const trained = new Set(history.map((workout) => dayKey(new Date(workout.started_at))))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index)
    return { label: date.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2), trained: trained.has(dayKey(date)) }
  })
}
