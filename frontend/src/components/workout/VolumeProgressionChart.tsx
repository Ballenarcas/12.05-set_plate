import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { WorkoutStatisticsVolumePoint } from '../../types/workout'
import { useSpring } from '../../utils/useSpring'
import { formatAxisVolume, formatChartDate, formatVolumeKg, volumeAxisTicks } from '../../utils/workoutStatistics'

interface VolumeProgressionChartProps {
  points: WorkoutStatisticsVolumePoint[]
  granularity: 'day' | 'week'
  rangeStart: string
  rangeEnd: string
}

type Point = { x: number; y: number }

const WIDTH = 640
const HEIGHT = 260
const PADDING = { top: 18, right: 20, bottom: 38, left: 44 }

function dayNumber(value: string): number {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return 0
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function axisLabelAnchor(x: number): 'start' | 'middle' | 'end' {
  if (x <= PADDING.left + 16) return 'start'
  if (x >= WIDTH - PADDING.right - 16) return 'end'
  return 'middle'
}

// A monotone cubic: it passes through every real reading and never rises or dips past them,
// so the curve cannot show a volume that was not lifted. Peaks and troughs get a flat tangent.
function smoothLine(points: Point[]) {
  const slopes = points.slice(0, -1).map((point, index) => (
    (points[index + 1].y - point.y) / ((points[index + 1].x - point.x) || 1)
  ))
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0] ?? 0
    if (index === points.length - 1) return slopes[index - 1]
    const before = slopes[index - 1]
    const after = slopes[index]
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after)
  })
  const segments = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]
    const third = (end.x - start.x) / 3
    return {
      start,
      end,
      first: { x: start.x + third, y: start.y + tangents[index] * third },
      second: { x: end.x - third, y: end.y - tangents[index + 1] * third },
    }
  })
  const path = segments.reduce(
    (line, { first, second, end }) => `${line} C${first.x.toFixed(2)} ${first.y.toFixed(2)} ${second.x.toFixed(2)} ${second.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    points.length ? `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}` : '',
  )

  // The same cubic at a fractional index, so the marker stays on the curve while it travels.
  const pointAt = (position: number): Point => {
    if (!segments.length) return points[0]
    const index = Math.min(segments.length - 1, Math.max(0, Math.floor(position)))
    const { start, first, second, end } = segments[index]
    const t = Math.min(1, Math.max(0, position - index))
    const m = 1 - t
    const along = (a: number, b: number, c: number, d: number) => m ** 3 * a + 3 * m * m * t * b + 3 * m * t * t * c + t ** 3 * d
    return { x: along(start.x, first.x, second.x, end.x), y: along(start.y, first.y, second.y, end.y) }
  }

  return { path, pointAt }
}

export default function VolumeProgressionChart({ points, granularity, rangeStart, rangeEnd }: VolumeProgressionChartProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const last = points.length - 1
  const shown = Math.min(selected ?? last, last)
  // x100 because the spring settles at an absolute threshold.
  const travelling = useSpring(shown * 100) / 100

  const yTicks = volumeAxisTicks(Math.max(...points.map((point) => point.volume_kg)))
  const maxVolume = yTicks[yTicks.length - 1]
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
  const { path, pointAt } = smoothLine(coordinates)
  const marker = pointAt(travelling)
  const total = points.reduce((sum, point) => sum + point.volume_kg, 0)
  const reading = points[shown]
  const readingDate = formatChartDate(reading.date, granularity)

  // Wireframe: only the first and last period are labelled.
  const labelIndexes = Array.from(new Set([0, last]))
  const fillId = useId()

  // The figure always snaps to a real period: a weekly total between two weeks was never recorded.
  function readAt(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - box.left) / (box.width || 1)) * WIDTH
    const nearest = coordinates.reduce((best, point, index) => (
      Math.abs(point.x - x) < Math.abs(coordinates[best].x - x) ? index : best
    ), 0)
    setSelected(nearest)
  }

  function readWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    event.preventDefault()
    setSelected(Math.max(0, Math.min(last, shown + step)))
  }

  return (
    <div className="stats-line-chart-wrap">
      <p className="stats-chart-reading" aria-hidden="true">
        <strong>{formatVolumeKg(reading.volume_kg)} kg</strong>
        <span>{readingDate}</span>
      </p>
      <div
        className="stats-chart-graphic"
        role="slider"
        tabIndex={0}
        aria-label={`Volume over time: ${points.length} recorded ${points.length === 1 ? 'period' : 'periods'} totaling ${formatVolumeKg(total)} kilograms`}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={shown}
        aria-valuetext={`${readingDate}: ${formatVolumeKg(reading.volume_kg)} kilograms`}
        data-reading={selected !== null || undefined}
        onPointerDown={readAt}
        onPointerMove={readAt}
        onPointerLeave={() => setSelected(null)}
        onPointerCancel={() => setSelected(null)}
        onKeyDown={readWithKeys}
        onBlur={() => setSelected(null)}
      >
        <svg className="stats-line-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          {yTicks.map((tick) => {
            const y = yFor(tick)
            return (
              <g key={tick}>
                <line className="stats-chart-grid" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
                <text className="stats-chart-axis-label" x={PADDING.left - 10} y={y + 4} textAnchor="end">
                  {formatAxisVolume(tick)}
                </text>
              </g>
            )
          })}

          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop className="stats-area-stop" offset="0" stopOpacity="0.5" />
              <stop className="stats-area-stop" offset="1" stopOpacity="0" />
            </linearGradient>
          </defs>
          {coordinates.length > 1 && (
            <path
              className="stats-area-path"
              d={`${path} L ${coordinates[last].x} ${baseline} L ${coordinates[0].x} ${baseline} Z`}
              fill={`url(#${fillId})`}
            />
          )}
          {coordinates.length > 1 && <path className="stats-line-path" d={path} pathLength={1} />}

          <line className="stats-line-guide" x1={marker.x} x2={marker.x} y1={PADDING.top} y2={baseline} />
          <circle className="stats-line-marker" cx={marker.x} cy={marker.y} r={7} />

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
