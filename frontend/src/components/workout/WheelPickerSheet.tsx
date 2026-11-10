import { useEffect, useId, useRef, useState } from 'react'
import { useDialogBehavior } from '../../utils/useDialogBehavior'

const ITEM_HEIGHT = 40

export type WheelOption<T> = { value: T; label: string }

type Props<T> = {
  title: string
  subtitle: string
  options: WheelOption<T>[]
  initialIndex: number
  onDone: (value: T) => void
  onClose: () => void
}

/** Bottom sheet with a scroll wheel; the centred row is chosen when Done is pressed. */
export default function WheelPickerSheet<T>({ title, subtitle, options, initialIndex, onDone, onClose }: Props<T>) {
  const dialogRef = useDialogBehavior(true, onClose)
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const id = useId()
  const [index, setIndex] = useState(initialIndex)

  useEffect(() => {
    if (wheelRef.current) wheelRef.current.scrollTop = initialIndex * ITEM_HEIGHT
  }, [initialIndex])

  const clampIndex = (value: number) => Math.min(options.length - 1, Math.max(0, value))
  const scrollTo = (next: number) => {
    const target = clampIndex(next)
    wheelRef.current?.scrollTo({ top: target * ITEM_HEIGHT, behavior: 'smooth' })
    setIndex(target)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="date-sheet rest-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="rest-sheet-grabber" aria-hidden="true" />
        <h2 id={`${id}-title`}>{title}</h2>
        <p className="rest-sheet-subtitle">{subtitle}</p>
        <div className="rest-wheel-frame">
          <span className="rest-wheel-highlight" aria-hidden="true" />
          <div
            className="rest-wheel"
            ref={wheelRef}
            role="listbox"
            aria-label={title}
            aria-activedescendant={`${id}-${index}`}
            tabIndex={0}
            onScroll={(event) => setIndex(clampIndex(Math.round(event.currentTarget.scrollTop / ITEM_HEIGHT)))}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
              event.preventDefault()
              scrollTo(index + (event.key === 'ArrowDown' ? 1 : -1))
            }}
          >
            {options.map((option, optionIndex) => (
              <div
                key={optionIndex}
                id={`${id}-${optionIndex}`}
                role="option"
                aria-selected={optionIndex === index}
                className={`rest-wheel-item${optionIndex === index ? ' is-selected' : ''}`}
                data-distance={Math.min(3, Math.abs(optionIndex - index))}
                onClick={() => scrollTo(optionIndex)}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>
        <button className="primary-button rest-sheet-done" type="button" onClick={() => onDone(options[index].value)}>Done</button>
      </div>
    </div>
  )
}
