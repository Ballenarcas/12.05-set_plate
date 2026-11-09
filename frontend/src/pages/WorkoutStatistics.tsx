import { Dumbbell, PieChart, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import MuscleGroupDistributionChart from '../components/workout/MuscleGroupDistributionChart'
import VolumeProgressionChart from '../components/workout/VolumeProgressionChart'
import { fetchWorkoutStatistics, getCurrentUser } from '../services/api'
import type { WorkoutStatistics, WorkoutStatisticsRange } from '../types/workout'
import { describeError } from '../utils/errors.js'
import {
  DEFAULT_STATISTICS_RANGE,
  STATISTICS_RANGES,
  formatCompactDuration,
  formatCompactVolumeKg,
  formatStatisticsDateRange,
  formatStatisticsDuration,
  formatVolumeKg,
  formatWorkoutCount,
} from '../utils/workoutStatistics'
import '../styles/workout-statistics.css'

// Half-oval range picker, in px because the dot follows the same SVG path with offset-path.
const DIAL = (() => {
  const rx = 115, ry = 38, side = 14, top = 34
  const left = side, right = side + 2 * rx
  return {
    width: right + side,
    height: top + ry + 40,
    path: `M ${left} ${top} A ${rx} ${ry} 0 0 0 ${right} ${top}`,
    labels: [
      { left, top: top - 6, transform: 'translate(-50%, -100%)' },
      { left: left + rx, top: top + ry + 4, transform: 'translateX(-50%)' },
      { left: right, top: top - 6, transform: 'translate(-50%, -100%)' },
    ],
  }
})()

interface MetricCardProps {
  label: string
  value: string
  exact: string
  note?: string
}

function MetricCard({ label, value, exact, note }: MetricCardProps) {
  const [number, unit] = value.split(' ')
  return (
    <article className="card stats-metric-card">
      <p className="stats-metric-label"><span>{label}</span><span>Total</span></p>
      <p className="stats-metric-value" title={exact}><span aria-hidden="true">{number}{unit && <small> {unit}</small>}</span><span className="visually-hidden">{exact}</span></p>
      {note && <p className="stats-metric-note">{note}</p>}
    </article>
  )
}

// Nothing shows while loading; screen readers still hear it.
function StatisticsSkeleton() {
  return <p className="visually-hidden" role="status">Loading workout statistics</p>
}

function durationValue(data: WorkoutStatistics, compact = false): string {
  if (data.total_workouts === 0) return compact ? '0m' : '0 min'
  if (data.workouts_with_duration === 0) return compact ? '–' : 'Unavailable'
  return compact ? formatCompactDuration(data.total_duration_seconds) : formatStatisticsDuration(data.total_duration_seconds)
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
    setError(null)
    setIsLoading(true)
    setRange(nextRange)
  }

  function retry() {
    requestId.current += 1
    setError(null)
    setIsLoading(true)
    setRetryToken((value) => value + 1)
  }

  const selectedRangeLabel = STATISTICS_RANGES.find((option) => option.value === range)?.label ?? range
  const displayedRangeLabel = data
    ? STATISTICS_RANGES.find((option) => option.value === data.range)?.label ?? data.range
    : null
  const volumeEmpty = data?.volume_progression.length === 0
  const distributionEmpty = data?.muscle_group_distribution.length === 0

  return (
    <div className="screen workout-stats-screen" aria-busy={isLoading}>
      {/* The wireframe starts with the range picker; the title stays for screen readers. */}
      <h1 className="visually-hidden">Statistics</h1>

      <section className="stats-range-section" aria-label="Date range">
        {/* Wireframe dial: the ranges sit around a half oval and a hollow dot slides along it to the chosen one. */}
        <div className="stats-range" role="group" aria-label="Statistics date range" style={{ width: DIAL.width, height: DIAL.height }}>
          <svg className="stats-range-arc" width={DIAL.width} height={DIAL.height} aria-hidden="true">
            <path d={DIAL.path} />
          </svg>
          <span
            className="stats-range-dot"
            aria-hidden="true"
            style={{
              offsetPath: `path('${DIAL.path}')`,
              offsetDistance: `${50 * Math.max(0, STATISTICS_RANGES.findIndex((option) => option.value === range))}%`,
            }}
          />
          {STATISTICS_RANGES.map((option, index) => (
            <button
              className={`stats-range-button stats-range-button-${index}`}
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              aria-label={option.description}
              onClick={() => changeRange(option.value)}
              style={DIAL.labels[index]}
            >
              {option.label}
            </button>
          ))}
        </div>
        {data?.range === range && (
          <p className="visually-hidden">{formatStatisticsDateRange(data.start_date, data.end_date)}</p>
        )}
      </section>

      {isLoading && !data && <StatisticsSkeleton />}

      {isLoading && data && (
        <p className="visually-hidden" role="status">
          Updating {selectedRangeLabel} statistics; showing {displayedRangeLabel} results until ready.
        </p>
      )}

      {!isLoading && error && (
        <div className="card state-card stats-error-card" role="alert">
          <p>{error}</p>
          <button className="secondary-action" type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {data && (isLoading || !error) && (
        <div className="stats-content">
          <div className="stats-total" aria-live="polite">
            <p className="stats-total-label">Total workouts</p>
            <p className="stats-total-value">{formatWorkoutCount(data.total_workouts)}</p>
          </div>
          <div className="stats-tiles">
            <MetricCard
              label="Volume"
              value={formatCompactVolumeKg(data.total_volume_kg)}
              exact={`${formatVolumeKg(data.total_volume_kg)} kg`}
              note={data.eligible_set_count === 0 ? 'No eligible weighted sets' : undefined}
            />
            <MetricCard
              label="Time"
              value={durationValue(data, true)}
              exact={durationValue(data)}
              note={durationNote(data) === 'Recorded session time' ? undefined : durationNote(data)}
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

          <h2 className="stats-section-title" id="volume-progression-title">Volume progression</h2>
          <section className="card stats-panel" aria-labelledby="volume-progression-title">
            {volumeEmpty ? (
              <div className="stats-chart-empty" role="status">
                <TrendingUp size={24} aria-hidden="true" />
                <p>No eligible weighted volume for this range.</p>
                <span>Completed sets with recorded reps and a positive weight will appear here.</span>
              </div>
            ) : (
              <VolumeProgressionChart
                key={data.range}
                points={data.volume_progression}
                granularity={data.progression_granularity}
                rangeStart={data.start_date}
                rangeEnd={data.end_date}
              />
            )}
          </section>

          <h2 className="stats-section-title" id="muscle-distribution-title">Muscle distribution</h2>
          <section className="card stats-panel" aria-labelledby="muscle-distribution-title">
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
              <MuscleGroupDistributionChart key={data.range} distribution={data.muscle_group_distribution} />
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
