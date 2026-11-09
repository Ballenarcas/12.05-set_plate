type Macro = { label: string; current: number; target: number }

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const percent = (current: number, target: number) => (target > 0 ? Math.max(0, Math.min(1, current / target)) : 0)

/** Calorie ring with macro bars beside it, as in the wireframes' "Daily intake" block. */
export default function DailyIntake({ consumed, goal, macros }: { consumed: number; goal: number; macros: Macro[] }) {
  const eaten = Math.round(consumed)
  const remaining = Math.round(goal - consumed)

  return (
    <div className="card intake-card">
      <div className="intake-ring-column">
        <div className="intake-ring" role="img" aria-label={`${eaten} of ${goal} kcal eaten`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="intake-ring-track" cx="50" cy="50" r={RADIUS} />
            <circle
              className="intake-ring-value"
              cx="50"
              cy="50"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - percent(consumed, goal))}
            />
          </svg>
          <div className="intake-ring-label" aria-hidden="true">
            <strong>{eaten.toLocaleString()}</strong>
            <span>/{goal.toLocaleString()} kcal</span>
          </div>
        </div>
        <p className="intake-remaining">{Math.abs(remaining).toLocaleString()} {remaining < 0 ? 'over' : 'remaining'}</p>
      </div>
      <ul className="intake-macros">
        {macros.map((macro) => (
          <li key={macro.label}>
            <span className="macro-label">{macro.label}</span>
            <span className="intake-macro-value">{Math.round(macro.current)}/{Math.round(macro.target)}g</span>
            <span className="macro-track" aria-hidden="true"><span style={{ width: `${percent(macro.current, macro.target) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
