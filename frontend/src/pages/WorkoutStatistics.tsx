import { ArrowLeft, Clock3, Dumbbell, PieChart, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import MuscleGroupDistributionChart from '../components/workout/MuscleGroupDistributionChart'
import VolumeProgressionChart from '../components/workout/VolumeProgressionChart'
import { fetchWorkoutStatistics, getCurrentUser } from '../services/api'
import type { WorkoutStatistics, WorkoutStatisticsRange } from '../types/workout'
import { describeError } from '../utils/errors.js'
import {
  DEFAULT_STATISTICS_RANGE,
  STATISTICS_RANGES,
  formatStatisticsDateRange,
  formatStatisticsDuration,
  formatVolumeKg,
  formatWorkoutCount,
} from '../utils/workoutStatistics'
import '../styles/workout-statistics.css'

interface MetricCardProps {
  icon: ReactNode
  label: string
  value: string
  note: string
}

function MetricCard({ icon, label, value, note }: MetricCardProps) {
  return (
    <article className="card stats-metric-card">
      <span className="stats-metric-icon" aria-hidden="true">{icon}</span>
      <p className="stats-metric-label">{label}</p>
      <p className="stats-metric-value">{value}</p>
      <p className="stats-metric-note">{note}</p>
    </article>
  )
}

function StatisticsSkeleton() {
  return (
    <div className="stats-loading" role="status" aria-label="Loading workout statistics">
      <div className="stats-metrics" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div className="card stats-metric-card" key={item}>
            <span className="skeleton skeleton-line w-short" />
            <span className="skeleton skeleton-line w-mid tall" />
            <span className="skeleton skeleton-line w-mid" />
          </div>
        ))}
      </div>
      <div className="card stats-panel" aria-hidden="true">
        <span className="skeleton skeleton-line w-mid tall" />
        <span className="skeleton stats-chart-skeleton" />
      </div>
      <div className="card stats-panel" aria-hidden="true">
        <span className="skeleton skeleton-line w-mid tall" />
        <span className="skeleton stats-chart-skeleton" />
      </div>
    </div>
  )
}

function durationValue(data: WorkoutStatistics): string {
  if (data.total_workouts === 0) return '0 min'
  if (data.workouts_with_duration === 0) return 'Unavailable'
  return formatStatisticsDuration(data.total_duration_seconds)
}

function durationNote(data: WorkoutStatistics): string {
  if (data.total_workouts === 0) return 'No completed sessions'
  if (data.workouts_with_duration === 0) return 'Missing recorded durations'
  if (data.workouts_with_duration < data.total_workouts) {
    return `${data.workouts_with_duration} of ${data.total_workouts} sessions timed`
  }
  return 'Recorded session time'
}

function WorkoutStatisticsPage() {
  const navigate = useNavigate()
  const userId = getCurrentUser()?.id
  const [range, setRange] = useState<WorkoutStatisticsRange>(DEFAULT_STATISTICS_RANGE)
  const [data, setData] = useState<WorkoutStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(userId))
  const [error, setError] = useState<string | null>(userId ? null : 'Sign in to view your workout statistics.')
  const [retryToken, setRetryToken] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    if (!userId) return

    const currentRequest = ++requestId.current
    const controller = new AbortController()

    fetchWorkoutStatistics(userId, range, controller.signal)
      .then((result) => {
        if (currentRequest === requestId.current) setData(result)
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return
        setError(describeError(requestError, "We couldn't load your workout statistics. Please try again."))
      })
      .finally(() => {
        if (currentRequest === requestId.current) setIsLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [range, retryToken, userId])

  function changeRange(nextRange: WorkoutStatisticsRange) {
    if (nextRange === range) return
    requestId.current += 1
    setData(null)
    setError(null)
    setIsLoading(true)
    setRange(nextRange)
  }

  function retry() {
    requestId.current += 1
    setData(null)
    setError(null)
    setIsLoading(true)
    setRetryToken((value) => value + 1)
  }

  const volumeEmpty = data?.volume_progression.length === 0
  const distributionEmpty = data?.muscle_group_distribution.length === 0

  return (
    <div className="screen workout-stats-screen" aria-busy={isLoading}>
      <header className="stats-page-header">
        <button
          className="icon-button stats-back-button"
          type="button"
          aria-label="Back to workouts"
          onClick={() => navigate('/workouts')}
        >
          <ArrowLeft size={21} aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">Training insights</p>
          <h1>Workout Statistics</h1>
        </div>
      </header>

      <section className="stats-range-section" aria-labelledby="stats-range-title">
        <div className="stats-range-heading">
          <h2 className="section-title" id="stats-range-title">Date range</h2>
          {data && <p className="stats-range-caption">{formatStatisticsDateRange(data.start_date, data.end_date)}</p>}
        </div>
        <div className="stats-range" role="group" aria-label="Statistics date range">
          {STATISTICS_RANGES.map((option) => (
            <button
              className="stats-range-button"
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              aria-label={option.description}
              onClick={() => changeRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {isLoading && <StatisticsSkeleton />}

      {!isLoading && error && (
        <div className="card state-card stats-error-card" role="alert">
          <p>{error}</p>
          <button className="secondary-action" type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="stats-content">
          <div className="stats-metrics" aria-live="polite">
            <MetricCard
              icon={<Dumbbell size={18} />}
              label="Total workouts"
              value={formatWorkoutCount(data.total_workouts)}
              note={data.total_workouts === 0 ? 'No completed sessions' : 'Completed sessions'}
            />
            <MetricCard
              icon={<TrendingUp size={18} />}
              label="Total volume"
              value={`${formatVolumeKg(data.total_volume_kg)} kg`}
              note={data.eligible_set_count === 0 ? 'No eligible weighted sets' : `${data.eligible_set_count} completed weighted sets`}
            />
            <MetricCard
              icon={<Clock3 size={18} />}
              label="Total time"
              value={durationValue(data)}
              note={durationNote(data)}
            />
          </div>

          {data.total_workouts === 0 && (
            <div className="card stats-empty-callout">
              <Dumbbell size={22} aria-hidden="true" />
              <div>
                <h2>No completed workouts in this range</h2>
                <p>Record and finish a workout to populate these statistics. A wider range may include older sessions.</p>
              </div>
            </div>
          )}

          <section className="card stats-panel" aria-labelledby="volume-progression-title">
            <div className="stats-panel-heading">
              <div>
                <h2 id="volume-progression-title"><TrendingUp size={17} aria-hidden="true" /> Volume Progression</h2>
                <p>Recorded weighted volume in kilograms over time.</p>
              </div>
              {!volumeEmpty && <span className="stats-panel-total">{formatVolumeKg(data.total_volume_kg)} kg</span>}
            </div>
            {volumeEmpty ? (
              <div className="stats-chart-empty" role="status">
                <TrendingUp size={24} aria-hidden="true" />
                <p>No eligible weighted volume for this range.</p>
                <span>Completed sets with recorded reps and a positive weight will appear here.</span>
              </div>
            ) : (
              <VolumeProgressionChart
                points={data.volume_progression}
                granularity={data.progression_granularity}
                rangeStart={data.start_date}
                rangeEnd={data.end_date}
              />
            )}
          </section>

          <section className="card stats-panel" aria-labelledby="muscle-distribution-title">
            <div className="stats-panel-heading">
              <div>
                <h2 id="muscle-distribution-title"><PieChart size={17} aria-hidden="true" /> Muscle Group Distribution</h2>
                <p>Recorded volume attributed to each exercise's primary muscle group.</p>
              </div>
            </div>
            {distributionEmpty ? (
              <div className="stats-chart-empty" role="status">
                <PieChart size={24} aria-hidden="true" />
                <p>No classified muscle-group volume for this range.</p>
                <span>
                  {data.unclassified_volume_kg > 0
                    ? 'Recorded exercises could not be matched to catalogue muscle groups.'
                    : 'Completed weighted sets linked to an exercise with muscle metadata will appear here.'}
                </span>
              </div>
            ) : (
              <MuscleGroupDistributionChart distribution={data.muscle_group_distribution} />
            )}
            {data.total_volume_kg > 0 && (
              <p className="stats-classification-note">
                {formatVolumeKg(data.classified_volume_kg)} kg classified of {formatVolumeKg(data.total_volume_kg)} kg recorded volume.
                {data.unclassified_volume_kg > 0 && ` ${formatVolumeKg(data.unclassified_volume_kg)} kg could not be mapped to a muscle group and is excluded from the chart.`}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default WorkoutStatisticsPage
