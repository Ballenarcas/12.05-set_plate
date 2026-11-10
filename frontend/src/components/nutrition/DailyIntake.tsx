import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { prefersStillness } from '../../utils/useSpring'

type Macro = { label: string; current: number; target: number }

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const COUNT_MS = 650
const percent = (current: number, target: number) => (target > 0 ? Math.max(0, Math.min(1, current / target)) : 0)
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/**
 * Counts the shown number from its previous value to the new one by writing the text directly,
 * so the card does not re-render on every frame.
 */
function useCountUp(value: number, enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null)
  const from = useRef(0)
  // Layout effect: the start number is written before paint, so the final one never flashes first.
  useLayoutEffect(() => {
    const start = from.current
    from.current = value
    // Write into React's own text node, so React's later updates still land on what is shown.
    const node = ref.current?.firstChild
    if (!enabled || !node || start === value) return
    node.nodeValue = Math.round(start).toLocaleString()
    const began = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - began) / COUNT_MS)
      node.nodeValue = Math.round(start + (value - start) * easeOutCubic(t)).toLocaleString()
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, enabled])
  return ref
}

/** Calorie ring with macro bars beside it, as in the wireframes' "Daily intake" block. */
export default function DailyIntake({ consumed, goal, macros, pending = false }: {
  consumed: number
  goal: number
  macros: Macro[]
  /** Data still loading: the card keeps its shape and fills in when it arrives. */
  pending?: boolean
}) {
  const eaten = Math.round(consumed)
  const remaining = Math.round(goal - consumed)
  const [still] = useState(prefersStillness)
  // First frame at zero, then the real values, so the ring and bars fill in as the card appears.
  const [entered, setEntered] = useState(still)
  useEffect(() => {
    if (entered || pending) return
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [entered, pending])
  const live = entered && !pending
  const eatenRef = useCountUp(live ? eaten : 0, !still)

  return (
    <div className="card intake-card" aria-busy={pending}>
      <div className="intake-ring-column">
        <div className="intake-ring" role="img" aria-label={pending ? 'Loading your daily intake' : `${eaten} of ${goal} kcal eaten`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="intake-ring-track" cx="50" cy="50" r={RADIUS} />
            <circle
              className="intake-ring-value"
              cx="50"
              cy="50"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - (live ? percent(consumed, goal) : 0))}
            />
          </svg>
          <div className="intake-ring-label" aria-hidden="true">
            <strong ref={eatenRef}>{(live || still ? eaten : 0).toLocaleString()}</strong>
            <span>/{pending ? '–' : goal.toLocaleString()} kcal</span>
          </div>
        </div>
        <p className="intake-remaining">
          {pending ? ' ' : `${Math.abs(remaining).toLocaleString()} ${remaining < 0 ? 'over' : 'remaining'}`}
        </p>
      </div>
      <ul className="intake-macros">
        {macros.map((macro, index) => (
          <li key={macro.label} style={{ '--macro-index': index } as React.CSSProperties}>
            <span className="macro-label">{macro.label}</span>
            <span className="intake-macro-value">{pending ? '–' : `${Math.round(macro.current)}/${Math.round(macro.target)}g`}</span>
            <span className="macro-track" aria-hidden="true">
              <span style={{ width: `${(live ? percent(macro.current, macro.target) : 0) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
