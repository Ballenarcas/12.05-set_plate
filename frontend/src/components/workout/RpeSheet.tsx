import { useState } from 'react'
import { useDialogBehavior } from '../../utils/useDialogBehavior'

const RPE_SCALE: { rpe: number; effort: string; reps: string }[] = [
  { rpe: 6, effort: 'Moderate Effort', reps: 'Could have done 4 more reps' },
  { rpe: 6.5, effort: 'Moderate Effort', reps: 'Could have done 3 to 4 more reps' },
  { rpe: 7, effort: 'Hard Effort', reps: 'Could have done 3 more reps' },
  { rpe: 7.5, effort: 'Hard Effort', reps: 'Could have done 2 to 3 more reps' },
  { rpe: 8, effort: 'Very Hard Effort', reps: 'Could have definitely done 2 more reps' },
  { rpe: 8.5, effort: 'Very Hard Effort', reps: 'Could have done 1 to 2 more reps' },
  { rpe: 9, effort: 'Very Hard Effort', reps: 'Could have definitely done 1 more rep' },
  { rpe: 9.5, effort: 'Near Max Effort', reps: 'Maybe could have done 1 more rep' },
  { rpe: 10, effort: 'Max Effort', reps: 'Could not have done any more reps' },
]

type Props = { subtitle: string; rpe: number | null; onDone: (rpe: number | null) => void; onClose: () => void }

/** RPE sheet: a big number with what it means, picked from a 6–10 strip in half steps. */
export default function RpeSheet({ subtitle, rpe, onDone, onClose }: Props) {
  const dialogRef = useDialogBehavior(true, onClose)
  const [value, setValue] = useState(() => (rpe === null ? 8 : Math.min(10, Math.max(6, Math.round(rpe * 2) / 2))))
  const current = RPE_SCALE.find((step) => step.rpe === value) ?? RPE_SCALE[4]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="date-sheet rest-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rpe-sheet-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="rest-sheet-grabber" aria-hidden="true" />
        <h2 id="rpe-sheet-title">Log Set RPE</h2>
        <p className="rest-sheet-subtitle rpe-sheet-subtitle">{subtitle}</p>
        <p className="rpe-sheet-value" aria-live="polite">
          <strong>{value}</strong>
          <span className="rpe-sheet-effort">{current.effort}</span>
          <span className="rpe-sheet-reps">{current.reps}</span>
        </p>
        <div className="rpe-strip" role="radiogroup" aria-label="RPE">
          {RPE_SCALE.map((step) => (
            <button
              key={step.rpe}
              type="button"
              role="radio"
              aria-checked={step.rpe === value}
              className={step.rpe === value ? 'is-selected' : undefined}
              onClick={() => setValue(step.rpe)}
            >
              {step.rpe}
            </button>
          ))}
        </div>
        <button className="primary-button rest-sheet-done" type="button" onClick={() => onDone(value)}>Done</button>
        {rpe !== null && <button className="text-action rpe-sheet-clear" type="button" onClick={() => onDone(null)}>Clear RPE</button>}
      </div>
    </div>
  )
}
