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
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = Math.max(0, items.findIndex(({ path }) => path === '/'
    ? pathname === '/'
    : pathname === path || pathname.startsWith(`${path}/`)))

  return (
    <nav
      className="gdock"
      aria-label="Primary navigation"
    >
      {items.map(({ path, label, Icon }, index) => {
        const isActive = active === index
        return (
          <button
            key={path}
            type="button"
            className="gdock-item"
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            data-active={isActive}
            onClick={() => navigate(path)}
          >
            <span className="gdock-glyph">
              <Icon size={21} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="gdock-dot" aria-hidden="true" />
          </button>
        )
      })}
    </nav>
  )
}
