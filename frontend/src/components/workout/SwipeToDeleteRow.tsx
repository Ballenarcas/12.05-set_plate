import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import '../../styles/swipe-row.css'

interface SwipeToDeleteRowProps {
  children: ReactNode
  label: string
  className?: string
  actionWidth?: number
  disabled?: boolean
  onDelete: () => void
}

type Gesture = {
  pointerId: number
  startX: number
  startY: number
  startOffset: number
  axis: 'pending' | 'horizontal' | 'vertical'
}

const DEFAULT_ACTION_WIDTH = 84
const REVEAL_THRESHOLD = 48
const COLLAPSE_MS = 200

function SwipeToDeleteRow({ children, label, className, actionWidth = DEFAULT_ACTION_WIDTH, disabled = false, onDelete }: SwipeToDeleteRowProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const gestureRef = useRef<Gesture | null>(null)
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [offset, setOffset] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isCollapsing, setIsCollapsing] = useState(false)

  useEffect(() => () => {
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current)
  }, [])

  function updateOffset(nextOffset: number) {
    offsetRef.current = nextOffset
    setOffset(nextOffset)
  }

  function closeRow() {
    updateOffset(0)
    setIsOpen(false)
  }

  function commitDelete() {
    if (disabled || isCollapsing) return
    setIsOpen(false)
    setIsCollapsing(true)
    commitTimerRef.current = setTimeout(onDelete, COLLAPSE_MS)
  }

  function finishGesture() {
    const currentOffset = offsetRef.current
    const width = rootRef.current?.offsetWidth || 320
    const commitThreshold = Math.min(Math.max(150, width * 0.52), width * 0.68)

    gestureRef.current = null
    setIsDragging(false)
    if (currentOffset <= -commitThreshold) {
      commitDelete()
    } else if (currentOffset <= -REVEAL_THRESHOLD) {
      updateOffset(-actionWidth)
      setIsOpen(true)
    } else {
      closeRow()
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target
    if (
      disabled || isCollapsing || event.button !== 0 || gestureRef.current ||
      (target instanceof Element && target.closest('button, a, [contenteditable="true"]'))
    ) return

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offsetRef.current,
      axis: 'pending',
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    if (gesture.axis === 'pending' && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
    }
    if (gesture.axis !== 'horizontal') return

    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setIsDragging(true)
    const maxOffset = Math.max(actionWidth, (rootRef.current?.offsetWidth || 320) * 0.68)
    updateOffset(Math.max(-maxOffset, Math.min(0, gesture.startOffset + deltaX)))
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (gesture.axis === 'horizontal') finishGesture()
    else gestureRef.current = null
  }

  function handleToggleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || isCollapsing) return
    if (event.key === 'ArrowLeft' || ((event.key === 'Enter' || event.key === ' ') && !isOpen)) {
      event.preventDefault()
      updateOffset(-actionWidth)
      setIsOpen(true)
    } else if (event.key === 'ArrowRight' || event.key === 'Escape' || ((event.key === 'Enter' || event.key === ' ') && isOpen)) {
      event.preventDefault()
      closeRow()
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && isOpen) {
      event.preventDefault()
      commitDelete()
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    setIsDragging(false)
    if (gesture.axis === 'horizontal') {
      if (offsetRef.current <= -REVEAL_THRESHOLD) {
        updateOffset(-actionWidth)
        setIsOpen(true)
      } else {
        closeRow()
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={`swipe-row${className ? ` ${className}` : ''}`}
      style={{ '--sr-a': `${actionWidth}px` } as CSSProperties}
      role="group"
      aria-label={label}
      data-open={isOpen ? '' : undefined}
      data-dragging={isDragging ? '' : undefined}
      data-phase={isCollapsing ? 'collapsing' : 'idle'}
      data-disabled={disabled ? '' : undefined}
    >
      <div className="swipe-row__clip">
        <div className="swipe-row__rail" aria-hidden={!isOpen}>
          <button
            className="swipe-row__action"
            type="button"
            aria-label={`Delete ${label}`}
            tabIndex={isOpen && !disabled ? 0 : -1}
            onClick={commitDelete}
            disabled={disabled}
          >
            <span className="swipe-row__glyph"><Trash2 size={19} aria-hidden="true" /><span>Delete</span></span>
          </button>
        </div>
        <div
          className="swipe-row__surface"
          style={{ transform: `translateX(${offset}px)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {children}
          <button
            className="swipe-row__toggle"
            type="button"
            tabIndex={disabled ? -1 : 0}
            aria-expanded={isOpen}
            aria-label={`${label} swipe actions`}
            onKeyDown={handleToggleKeyDown}
          >
            {isOpen ? 'Close delete action' : 'Show delete action'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SwipeToDeleteRow
