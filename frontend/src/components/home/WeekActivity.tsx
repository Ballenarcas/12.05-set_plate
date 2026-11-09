import { useEffect, useState } from 'react'
import { fetchWorkoutHistory } from '../../services/api'
import type { WorkoutHistoryEntry } from '../../types/workout'
import { lastSevenDays } from '../../utils/weekActivity'

export default function WeekActivity({ userId }: { userId: string }) {
  const [history, setHistory] = useState<WorkoutHistoryEntry[] | null>(null)

  useEffect(() => {
    let isCurrent = true
    fetchWorkoutHistory(userId)
      .then((items) => { if (isCurrent) setHistory(items) })
      .catch(() => { if (isCurrent) setHistory([]) })
    return () => { isCurrent = false }
  }, [userId])

  const days = lastSevenDays(history ?? [])
  const count = days.filter((day) => day.trained).length

  return (
    <div className="card activity-card" aria-busy={history === null}>
      <p className="eyebrow">Last 7 days</p>
      <ol className="activity-bars" aria-label={`${count} of the last 7 days with a workout`}>
        {days.map((day, index) => (
          <li key={index} className={day.trained ? 'is-trained' : undefined}>
            <span className="activity-bar" aria-hidden="true" />
            <span className="activity-day">{day.label}</span>
          </li>
        ))}
      </ol>
      <p className="activity-count"><strong>{history === null ? '–' : count}/7</strong><span>completed workouts</span></p>
    </div>
  )
}
