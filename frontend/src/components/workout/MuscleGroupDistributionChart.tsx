import type { WorkoutStatisticsMuscleGroup } from '../../types/workout'
import { formatPercentage, formatVolumeKg } from '../../utils/workoutStatistics'

interface MuscleGroupDistributionChartProps {
  distribution: WorkoutStatisticsMuscleGroup[]
}

const MUSCLE_COLORS = [
  '#28cd62',
  '#8b7bb8',
  '#d6b85a',
  '#66b3ff',
  '#ff8a65',
  '#4dd0c4',
  '#c77dff',
  '#f4a261',
  '#9ccc65',
  '#f06292',
]

const RADIUS = 74
const STROKE = 28
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function MuscleGroupDistributionChart({ distribution }: MuscleGroupDistributionChartProps) {
  const classifiedTotal = distribution.reduce((sum, item) => sum + item.volume_kg, 0)
  const lengths = distribution.map((item) => (
    classifiedTotal > 0 ? (item.volume_kg / classifiedTotal) * CIRCUMFERENCE : 0
  ))
  const offsets = lengths.map((_, index) => lengths.slice(0, index).reduce((sum, length) => sum + length, 0))
  const segments = distribution.map((item, index) => ({
    ...item,
    color: MUSCLE_COLORS[index % MUSCLE_COLORS.length],
    dashArray: `${lengths[index]} ${Math.max(0, CIRCUMFERENCE - lengths[index])}`,
    dashOffset: -offsets[index],
    percentage: formatPercentage(item.volume_kg, classifiedTotal),
  }))

  return (
    <div className="stats-distribution">
      <div className="stats-doughnut-wrap">
        <svg
          className="stats-doughnut"
          viewBox="0 0 200 200"
          role="img"
          aria-label={`Muscle group distribution: ${distribution.length} classified muscle groups totaling ${formatVolumeKg(classifiedTotal)} kilograms`}
        >
          <circle className="stats-doughnut-track" cx="100" cy="100" r={RADIUS} fill="none" strokeWidth={STROKE} />
          {segments.map((segment) => (
            <circle
              className="stats-doughnut-segment"
              key={segment.muscle_group}
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth={STROKE}
              strokeDasharray={segment.dashArray}
              strokeDashoffset={segment.dashOffset}
              transform="rotate(-90 100 100)"
            >
              <title>{`${segment.muscle_group}: ${formatVolumeKg(segment.volume_kg)} kg (${segment.percentage})`}</title>
            </circle>
          ))}
          <text className="stats-doughnut-value" x="100" y="96" textAnchor="middle">
            {formatVolumeKg(classifiedTotal)}
          </text>
          <text className="stats-doughnut-unit" x="100" y="116" textAnchor="middle">
            kg classified
          </text>
        </svg>
      </div>

      <ul className="stats-legend" aria-label="Muscle group volumes">
        {segments.map((segment) => (
          <li key={segment.muscle_group}>
            <span className="stats-legend-marker" style={{ background: segment.color }} aria-hidden="true" />
            <span className="stats-legend-name">{segment.muscle_group}</span>
            <span className="stats-legend-value">{formatVolumeKg(segment.volume_kg)} kg</span>
            <span className="stats-legend-percent">{segment.percentage}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
