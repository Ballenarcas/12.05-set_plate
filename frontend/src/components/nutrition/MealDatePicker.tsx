import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { monthWeeks, sameDay } from '../../utils/monthGrid'
import { useDialogBehavior } from '../../utils/useDialogBehavior'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Props = { selected: Date; min: Date; max: Date; onSelect: (date: Date) => void; onClose: () => void }

/** Bottom-sheet calendar in the wireframes' style: Monday first, round days, the chosen day ringed. */
export default function MealDatePicker({ selected, min, max, onSelect, onClose }: Props) {
  const [view, setView] = useState({ year: selected.getFullYear(), month: selected.getMonth() })
  const dialogRef = useDialogBehavior(true, onClose)
  const today = new Date()
  const canGoBack = new Date(view.year, view.month, 0) >= new Date(min.getFullYear(), min.getMonth(), min.getDate())
  const canGoForward = new Date(view.year, view.month + 1, 1) <= max
  const move = (step: number) => setView(({ year, month }) => {
    const next = new Date(year, month + step, 1)
    return { year: next.getFullYear(), month: next.getMonth() }
  })
  const isAllowed = (day: Date) => day >= new Date(min.getFullYear(), min.getMonth(), min.getDate()) && day <= max

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="date-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="date-sheet-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="date-sheet-heading">
          <button className="icon-button" type="button" onClick={() => move(-1)} disabled={!canGoBack} aria-label="Previous month">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <h2 id="date-sheet-title">{new Date(view.year, view.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <button className="icon-button" type="button" onClick={() => move(1)} disabled={!canGoForward} aria-label="Next month">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="date-grid" role="grid">
          <div className="date-row" role="row">
            {WEEKDAYS.map((weekday) => <span className="date-weekday" role="columnheader" key={weekday}>{weekday}</span>)}
          </div>
          {monthWeeks(view.year, view.month).map((week) => (
            <div className="date-row" role="row" key={week[0].toISOString()}>
              {week.map((day) => {
                const allowed = isAllowed(day)
                const classes = [
                  'date-day',
                  day.getMonth() !== view.month && 'is-outside',
                  allowed && 'is-allowed',
                  sameDay(day, selected) && 'is-selected',
                  sameDay(day, today) && 'is-today',
                ].filter(Boolean).join(' ')
                return (
                  <span role="gridcell" key={day.toISOString()}>
                    <button
                      className={classes}
                      type="button"
                      disabled={!allowed}
                      aria-pressed={sameDay(day, selected)}
                      aria-label={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      onClick={() => onSelect(day)}
                    >
                      {day.getDate()}
                    </button>
                  </span>
                )
              })}
            </div>
          ))}
        </div>
        <p className="date-sheet-note">You can review the last 7 days.</p>
      </div>
    </div>
  )
}
