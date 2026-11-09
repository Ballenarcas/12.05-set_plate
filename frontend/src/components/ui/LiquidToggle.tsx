import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useSpring, useTransform, useVelocity } from 'framer-motion'

const TRACK = 52
const THUMB = 24
const PAD = (30 - THUMB) / 2
const SHUT_X = PAD
const OPEN_X = TRACK - THUMB - PAD
const MID_X = (SHUT_X + OPEN_X) / 2
const SETTLE = { type: 'spring' as const, stiffness: 170, damping: 21.5, mass: 0.9 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
// The droplet lengthens with speed; scaleY is 1/scaleX so its area stays the same.
const lengthen = (v: number) => 1 + Math.min(0.4, Math.abs(v) / 600) * 0.36

type Props = { checked: boolean; onChange: (checked: boolean) => void; label: string }

/** Liquid switch: tap or drag the droplet; it flips as it passes the middle. */
export default function LiquidToggle({ checked, onChange, label }: Props) {
  const [held, setHeld] = useState(false)
  const [hot, setHot] = useState(false)
  const rail = useRef<HTMLButtonElement | null>(null)
  const grip = useRef<{ id: number; grab: number | null; moved: boolean } | null>(null)

  const x = useMotionValue<number>(checked ? OPEN_X : SHUT_X)
  const eased = useSpring(useVelocity(x), { stiffness: 380, damping: 34, mass: 0.6 })
  const swell = useSpring(hot ? 1.035 : 1, { stiffness: 380, damping: 34, mass: 0.6 })
  const wide = useTransform([eased, swell], ([v, s]: number[]) => lengthen(v) * s)
  const tall = useTransform([eased, swell], ([v, s]: number[]) => s / lengthen(v))

  useEffect(() => {
    if (held) return
    const run = animate(x, checked ? OPEN_X : SHUT_X, SETTLE)
    return () => run.stop()
  }, [checked, held, x])

  const local = (clientX: number) => {
    const el = rail.current
    if (!el) return 0
    const box = el.getBoundingClientRect()
    return (clientX - box.left) / (box.width / (el.offsetWidth || box.width) || 1)
  }

  const down = (e: React.PointerEvent) => {
    // The offset is taken at the first move, so a press anywhere never makes the droplet jump.
    grip.current = { id: e.pointerId, grab: null, moved: false }
    setHeld(true)
    try { rail.current?.setPointerCapture(e.pointerId) } catch { /* not a live pointer */ }
  }

  const move = (e: React.PointerEvent) => {
    const g = grip.current
    if (!g || g.id !== e.pointerId) return
    const at = local(e.clientX)
    if (g.grab === null) g.grab = at - x.get()
    const next = clamp(at - g.grab, SHUT_X, OPEN_X)
    if (Math.abs(next - x.get()) > 0.4) g.moved = true
    x.set(next)
    const past = next > MID_X
    if (past !== checked) onChange(past)
  }

  const up = (e: React.PointerEvent) => {
    const g = grip.current
    if (!g) return
    grip.current = null
    try { rail.current?.releasePointerCapture?.(e.pointerId) } catch { /* never captured */ }
    if (!g.moved) onChange(!checked)
    setHeld(false)
  }

  return (
    <button
      ref={rail}
      type="button"
      className="liq-sw"
      data-on={checked}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      style={{ '--liq-thumb': `${THUMB}px` } as React.CSSProperties}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return
        e.preventDefault()
        onChange(!checked)
      }}
    >
      <span className="liq-sw-blobs" aria-hidden="true">
        <motion.span className="liq-thumb" style={{ x, scaleX: wide, scaleY: tall }} />
      </span>
    </button>
  )
}
