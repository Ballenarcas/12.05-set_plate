import { useRef, useState } from 'react'
import { Apple, Dumbbell, House, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import '../../styles/glass-dock.css'

type DockItem = { path: string; label: string; Icon: LucideIcon }

const items: DockItem[] = [
  { path: '/', label: 'Home', Icon: House },
  { path: '/workouts', label: 'Workouts', Icon: Dumbbell },
  { path: '/nutrition', label: 'Nutrition', Icon: Apple },
  { path: '/settings', label: 'Settings', Icon: Settings },
]

export default function GlassDock() {
  const [hover, setHover] = useState<number | null>(null)
  const bar = useRef<HTMLElement>(null)
  const down = useRef(false)
  const chose = useRef(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = Math.max(0, items.findIndex(({ path }) => path === '/'
    ? pathname === '/'
    : pathname === path || pathname.startsWith(`${path}/`)))

  const itemAt = (x: number) => {
    const buttons = bar.current?.querySelectorAll<HTMLButtonElement>('.gdock-item')
    if (!buttons?.length) return null
    let closest = 0
    let distance = Infinity
    buttons.forEach((button, index) => {
      const bounds = button.getBoundingClientRect()
      const nextDistance = Math.abs(x - (bounds.left + bounds.width / 2))
      if (nextDistance < distance) { distance = nextDistance; closest = index }
    })
    return closest
  }

  return (
    <nav
      className="gdock"
      aria-label="Primary navigation"
      ref={bar}
      onPointerDownCapture={(event) => {
        down.current = true
        chose.current = false
        setHover(itemAt(event.clientX))
      }}
      onPointerMoveCapture={(event) => {
        if (event.pointerType === 'mouse' || down.current) setHover(itemAt(event.clientX))
      }}
      onPointerUpCapture={(event) => {
        if (down.current && event.pointerType !== 'mouse') {
          const index = itemAt(event.clientX)
          if (index !== null) {
            chose.current = true
            navigate(items[index].path)
          }
        }
        down.current = false
        if (event.pointerType !== 'mouse') setHover(null)
      }}
      onPointerCancelCapture={() => { down.current = false; setHover(null) }}
      onPointerLeave={() => { if (!down.current) setHover(null) }}
    >
      {items.map(({ path, label, Icon }, index) => {
        const distance = hover === null ? Infinity : Math.abs(index - hover)
        const influence = distance > 2 ? 0 : (1 + Math.cos((Math.PI * distance) / 3)) / 2
        const scale = 1 + 0.32 * influence
        const isActive = active === index
        return (
          <button
            key={path}
            type="button"
            className="gdock-item"
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            data-active={isActive}
            data-near={distance <= 1 ? distance : undefined}
            onClick={() => { if (!chose.current) navigate(path) }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span className="gdock-glyph" style={{ transform: `translateY(${-8 * influence}px) scale(${scale})` }}>
              <Icon size={21} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="gdock-dot" data-on={isActive} />
            <span className="gdock-tip" data-on={hover === index}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
