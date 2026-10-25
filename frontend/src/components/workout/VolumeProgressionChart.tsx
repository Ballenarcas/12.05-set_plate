import type { WorkoutStatisticsVolumePoint } from '../../types/workout'
import { formatChartDate, formatVolumeKg } from '../../utils/workoutStatistics'

interface VolumeProgressionChartProps {
  points: WorkoutStatisticsVolumePoint[]
  granularity: 'day' | 'week'
  rangeStart: string
  rangeEnd: string
}

const WIDTH = 640
const HEIGHT = 260
const PADDING = { top: 18, right: 14, bottom: 38, left: 58 }

function dayNumber(value: string): number {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return 0
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function axisVolume(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`
  return formatVolumeKg(value)
}

function axisLabelAnchor(x: number): 'start' | 'middle' | 'end' {
  if (x <= PADDING.left + 16) return 'start'
  if (x >= WIDTH - PADDING.right - 16) return 'end'
  return 'middle'
}

export default function VolumeProgressionChart({ points, granularity, rangeStart, rangeEnd }: VolumeProgressionChartProps) {
  const maxVolume = Math.max(...points.map((point) => point.volume_kg), 1)
  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const baseline = PADDING.top + plotHeight
  const firstDay = dayNumber(rangeStart)
  const lastDay = Math.max(firstDay + 1, dayNumber(rangeEnd))
  const xFor = (bucketDate: string) => {
    const position = (dayNumber(bucketDate) - firstDay) / (lastDay - firstDay)
    return PADDING.left + Math.max(0, Math.min(1, position)) * plotWidth
  }
  const yFor = (volume: number) => PADDING.top + (1 - volume / maxVolume) * plotHeight

  const coordinates = points.map((point) => ({
    ...point,
    x: xFor(point.date),
    y: yFor(point.volume_kg),
  }))
  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const areaPath = coordinates.length > 1
    ? `${linePath} L${coordinates[coordinates.length - 1].x.toFixed(2)} ${baseline} L${coordinates[0].x.toFixed(2)} ${baseline} Z`
    : ''
  const total = points.reduce((sum, point) => sum + point.volume_kg, 0)

  const maxLabels = granularity === 'week' ? 3 : 4
  const tickCount = Math.min(maxLabels, points.length)
  const tickIndexes = Array.from({ length: tickCount }, (_, index) => {
    if (points.length === 1) return 0
    return Math.round((index / Math.max(1, tickCount - 1)) * (points.length - 1))
  })
  const labelIndexes = Array.from(new Set(tickIndexes)).sort((a, b) => a - b)
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxVolume / 4) * index)

  return (
    <div className="stats-line-chart-wrap">
      <div
        className="stats-chart-graphic"
        role="img"
        aria-label={`Volume progression chart: ${points.length} recorded ${points.length === 1 ? 'period' : 'periods'} totaling ${formatVolumeKg(total)} kilograms`}
      >
        <svg className="stats-line-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          {yTicks.map((tick) => {
            const y = yFor(tick)
            return (
              <g key={tick}>
                <line className="stats-chart-grid" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
                <text className="stats-chart-axis-label" x={PADDING.left - 10} y={y + 4} textAnchor="end">
                  {axisVolume(tick)}
                </text>
              </g>
            )
          })}

          {areaPath && <path className="stats-line-area" d={areaPath} />}
          {coordinates.length > 1 && <path className="stats-line-path" d={linePath} />}

          {coordinates.map((point) => (
            <g key={point.date}>
              <circle className="stats-line-point-hit" cx={point.x} cy={point.y} r={12} />
              <circle className="stats-line-point" cx={point.x} cy={point.y} r={4.5} />
              <title>{`${formatChartDate(point.date, granularity)}: ${formatVolumeKg(point.volume_kg)} kg`}</title>
            </g>
          ))}

          {labelIndexes.map((index) => {
            const point = coordinates[index]
            return (
              <text
                className="stats-chart-axis-label"
                key={point.date}
                x={point.x}
                y={HEIGHT - 12}
                textAnchor={axisLabelAnchor(point.x)}
              >
                {formatChartDate(point.date, granularity)}
              </text>
            )
          })}
        </svg>
      </div>

      <ul className="visually-hidden">
        {points.map((point) => (
          <li key={point.date}>
            {formatChartDate(point.date, granularity)}: {formatVolumeKg(point.volume_kg)} kg
          </li>
        ))}
      </ul>
    </div>
  )
}
