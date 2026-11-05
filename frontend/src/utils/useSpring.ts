import { useEffect, useRef, useState } from 'react'

const STIFFNESS = 0.16
const DECAY = 0.72
const SETTLED = 0.02

export function prefersStillness(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Work in pixels or 0-100: the settle threshold is absolute, so a 0-1 value would stop before it visibly moved.
export function useSpring(target: number): number {
  const [value, setValue] = useState(target)
  const current = useRef(target)
  const velocity = useRef(0)
  const still = prefersStillness()

  useEffect(() => {
    if (still) {
      current.current = target
      velocity.current = 0
      return
    }
    let frame = 0
    let previous = 0
    const tick = (time: number) => {
      // Decay is raised to the frame delta, so a dropped frame loses the same energy as the two it replaced.
      const delta = previous ? Math.min(2.5, Math.max(0, (time - previous) / 16.67)) : 1
      previous = time
      velocity.current += (target - current.current) * STIFFNESS * delta
      velocity.current *= Math.pow(DECAY, delta)
      current.current += velocity.current * delta
      if (Math.abs(target - current.current) < SETTLED && Math.abs(velocity.current) < SETTLED) {
        current.current = target
        velocity.current = 0
        setValue(target)
        return
      }
      setValue(current.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, still])

  return still ? target : value
}
