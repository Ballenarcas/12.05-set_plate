import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { prefersStillness } from '../../utils/useSpring'
import type { WorkoutStatisticsMuscleGroup } from '../../types/workout'
import { formatPercentage, formatVolumeKg } from '../../utils/workoutStatistics'

interface MuscleGroupDistributionChartProps {
  distribution: WorkoutStatisticsMuscleGroup[]
}

// Wireframe style: greys from dark to light in the order the groups arrive (largest volume first).
// Ink mixed toward the card colour, so the shades follow light and dark mode.
const MUSCLE_SHADES = [88, 70, 54, 40, 28, 18].map((ink) => `color-mix(in srgb, var(--text) ${ink}%, var(--surface))`)
const SEGMENT_GAP = 2.5

const RADIUS = 72
const STROKE = 14
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// One entrance, played when the chart scrolls into view: the ring winds in a quarter turn while it draws,
// and the total counts up with it. Slow in, slow out, so it reads as one gesture.
// Native Web Animations and a direct text update, so the chart doesn't re-render on every frame.
const DRAW = { duration: 1100, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export default function MuscleGroupDistributionChart({ distribution }: MuscleGroupDistributionChartProps) {
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const revealId = useId()
  const classifiedTotal = distribution.reduce((sum, item) => sum + item.volume_kg, 0)
  const chartRef = useRef<HTMLDivElement | null>(null)
  const revealRef = useRef<SVGCircleElement | null>(null)
  const ringRef = useRef<SVGGElement | null>(null)
  const valueRef = useRef<SVGTextElement | null>(null)
  const [still] = useState(prefersStillness)
  const [shown, setShown] = useState(still)
  const [counted, setCounted] = useState(still)

  // Start once, when 40% of the chart is on screen.
  useEffect(() => {
    const chart = chartRef.current
    if (shown || !chart) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); observer.disconnect() }
    }, { threshold: 0.4 })
    observer.observe(chart)
    return () => observer.disconnect()
  }, [shown])

  useEffect(() => {
    if (!shown || still) return
    const reveal = revealRef.current?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], DRAW)
    const ring = ringRef.current?.animate([{ transform: 'rotate(-90deg)' }, { transform: 'rotate(0deg)' }], DRAW)
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / DRAW.duration)
      // React's own text node, so its later updates still land on what is shown.
      const text = valueRef.current?.firstChild
      if (text) text.nodeValue = `${formatVolumeKg(Math.round(classifiedTotal * easeInOutCubic(progress)))} kg`
      if (progress < 1) frame = requestAnimationFrame(tick)
      else setCounted(true)
    })
    return () => { cancelAnimationFrame(frame); reveal?.cancel(); ring?.cancel() }
  }, [shown, still, classifiedTotal])
  let accumulatedLength = 0
  const segments = distribution.map((item, index) => {
    const length = classifiedTotal > 0 ? (item.volume_kg / classifiedTotal) * CIRCUMFERENCE : 0
    const middleAngle = (accumulatedLength + length / 2) / CIRCUMFERENCE * 2 * Math.PI - Math.PI / 2
    const segment = {
      ...item,
      color: MUSCLE_SHADES[index % MUSCLE_SHADES.length],
      share: classifiedTotal > 0 ? (item.volume_kg / classifiedTotal) * 100 : 0,
      length,
      dashOffset: -accumulatedLength,
      // Where the slice moves when chosen: outwards, along its own middle.
      offsetX: Math.cos(middleAngle) * 6,
      offsetY: Math.sin(middleAngle) * 6,
      percentage: formatPercentage(item.volume_kg, classifiedTotal),
    }
    accumulatedLength += length
    return segment
  })
  const selectedSegment = segments.find((segment) => segment.muscle_group === selectedMuscle)

  function toggleMuscle(muscleGroup: string) {
    navigator.vibrate?.(8)
    setSelectedMuscle((current) => current === muscleGroup ? null : muscleGroup)
  }

  return (
    <div className="stats-distribution" ref={chartRef} data-visible={shown || undefined} data-selected={selectedMuscle !== null || undefined}>
      <ul className="stats-muscle-legend" aria-label="Muscle groups">
        {segments.map((segment) => (
          <li key={segment.muscle_group}>
            <button
              type="button"
              className="stats-legend-chip"
              aria-pressed={selectedMuscle === segment.muscle_group}
              onClick={() => toggleMuscle(segment.muscle_group)}
            >
              <span className="stats-legend-swatch" style={{ backgroundColor: segment.color }} aria-hidden="true" />
              {segment.muscle_group}
            </button>
          </li>
        ))}
      </ul>

      <div className="stats-doughnut-wrap">
        <svg
          className="stats-doughnut"
          viewBox="0 0 200 200"
          role="group"
          aria-label={`Muscle group distribution: ${distribution.length} groups, ${formatVolumeKg(classifiedTotal)} kilograms classified`}
          data-selected={selectedMuscle !== null || undefined}
          // Tapping the empty middle or around the ring clears the choice.
          onClick={(event) => { if (!(event.target as Element).closest('.stats-doughnut-segment')) setSelectedMuscle(null) }}
        >
          {/* One mask draws the whole ring, so every slice shares a single continuous stroke. */}
          <mask id={revealId} maskUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240">
            <circle
              ref={revealRef}
              className="stats-doughnut-reveal"
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke="#fff"
              strokeWidth={STROKE + 24}
              pathLength={1}
              transform="rotate(-90 100 100)"
            />
          </mask>
          <circle
            className="stats-doughnut-track"
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
          />
          <g ref={ringRef} className="stats-doughnut-ring" mask={`url(#${revealId})`}>
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
              style={{ stroke: segment.color, '--pop-x': `${segment.offsetX}px`, '--pop-y': `${segment.offsetY}px` } as CSSProperties}
              strokeDasharray={`${Math.max(0, segment.length - (segments.length > 1 ? SEGMENT_GAP : 0))} ${CIRCUMFERENCE}`}
              strokeDashoffset={segment.dashOffset}
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
          </g>
          <g className="stats-doughnut-label" key={selectedMuscle ?? 'total'}>
            <text ref={valueRef} className="stats-doughnut-value" x="100" y="96" textAnchor="middle">
              {selectedSegment?.percentage ?? `${formatVolumeKg(counted ? classifiedTotal : 0)} kg`}
            </text>
            <text className="stats-doughnut-unit" x="100" y="116" textAnchor="middle">
              {selectedSegment?.muscle_group ?? 'classified'}
            </text>
          </g>
        </svg>
      </div>


      <ul className="stats-muscle-list" aria-label="Muscle group volume details">
        {segments.map((segment, index) => (
          <li
            style={{ '--row': index } as CSSProperties}
            className={`stats-muscle-bar${selectedMuscle === segment.muscle_group ? ' is-selected' : ''}`}
            key={segment.muscle_group}
            role="progressbar"
            aria-label={`${segment.muscle_group}: ${formatVolumeKg(segment.volume_kg)} kg, ${segment.percentage} of classified volume`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(segment.share)}
          >
            <span className="stats-muscle-fill" style={{ width: `${segment.share}%` }} aria-hidden="true" />
            <span className="stats-muscle-name" aria-hidden="true">{segment.muscle_group}</span>
            <span className="stats-muscle-volume" aria-hidden="true">{formatVolumeKg(segment.volume_kg)} kg <small>{segment.percentage}</small></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
