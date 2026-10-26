import { useState } from 'react'
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

function colorForMuscle(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return MUSCLE_COLORS[hash % MUSCLE_COLORS.length]
}

const RADIUS = 72
const STROKE = 28
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function MuscleGroupDistributionChart({ distribution }: MuscleGroupDistributionChartProps) {
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const classifiedTotal = distribution.reduce((sum, item) => sum + item.volume_kg, 0)
  let accumulatedLength = 0
  const segments = distribution.map((item) => {
    const length = classifiedTotal > 0 ? (item.volume_kg / classifiedTotal) * CIRCUMFERENCE : 0
    const middleAngle = (accumulatedLength + length / 2) / CIRCUMFERENCE * 2 * Math.PI - Math.PI / 2
    const segment = {
      ...item,
      color: colorForMuscle(item.muscle_group),
      share: classifiedTotal > 0 ? (item.volume_kg / classifiedTotal) * 100 : 0,
      length,
      dashOffset: -accumulatedLength,
      offsetX: Math.cos(middleAngle) * 7,
      offsetY: Math.sin(middleAngle) * 7,
      percentage: formatPercentage(item.volume_kg, classifiedTotal),
    }
    accumulatedLength += length
    return segment
  })
  const selectedSegment = segments.find((segment) => segment.muscle_group === selectedMuscle)

  function toggleMuscle(muscleGroup: string) {
    setSelectedMuscle((current) => current === muscleGroup ? null : muscleGroup)
  }

  return (
    <div className="stats-distribution">
      <div className="stats-doughnut-wrap">
        <svg
          className="stats-doughnut"
          viewBox="0 0 200 200"
          role="group"
          aria-label={`Muscle group distribution: ${distribution.length} groups, ${formatVolumeKg(classifiedTotal)} kilograms classified`}
        >
          <circle
            className="stats-doughnut-track"
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
          />
          {segments.map((segment) => (
            <circle
              className="stats-doughnut-segment"
              key={segment.muscle_group}
              role="button"
              tabIndex={0}
              aria-label={`${segment.muscle_group}: ${segment.percentage} of classified volume`}
              aria-pressed={selectedMuscle === segment.muscle_group}
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth={STROKE}
              strokeDasharray={`${segment.length} ${Math.max(0, CIRCUMFERENCE - segment.length)}`}
              strokeDashoffset={segment.dashOffset}
              transform={selectedMuscle === segment.muscle_group
                ? `translate(${segment.offsetX} ${segment.offsetY}) rotate(-90 100 100)`
                : 'rotate(-90 100 100)'}
              onClick={() => toggleMuscle(segment.muscle_group)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleMuscle(segment.muscle_group)
                }
              }}
            >
              <title>{`${segment.muscle_group}: ${formatVolumeKg(segment.volume_kg)} kg (${segment.percentage})`}</title>
            </circle>
          ))}
          <text className="stats-doughnut-value" x="100" y="96" textAnchor="middle">
            {selectedSegment?.percentage ?? `${formatVolumeKg(classifiedTotal)} kg`}
          </text>
          <text className="stats-doughnut-unit" x="100" y="116" textAnchor="middle">
            {selectedSegment?.muscle_group ?? 'classified'}
          </text>
        </svg>
      </div>

      <ul className="stats-muscle-list" aria-label="Muscle group volume details">
        {segments.map((segment) => (
          <li
            className={`stats-muscle-item${selectedMuscle === segment.muscle_group ? ' stats-muscle-item-selected' : ''}`}
            key={segment.muscle_group}
          >
            <div className="stats-muscle-heading">
              <span
                className="stats-muscle-marker"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span className="stats-muscle-name">{segment.muscle_group}</span>
              <span className="stats-muscle-percent">{segment.percentage}</span>
            </div>
            <p className="stats-muscle-volume">{formatVolumeKg(segment.volume_kg)} kg</p>
            <div
              className="stats-muscle-track"
              role="progressbar"
              aria-label={`${segment.muscle_group} share of classified volume`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(segment.share)}
            >
              <span
                className="stats-muscle-fill"
                style={{ backgroundColor: segment.color, width: `${segment.share}%` }}
                aria-hidden="true"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
