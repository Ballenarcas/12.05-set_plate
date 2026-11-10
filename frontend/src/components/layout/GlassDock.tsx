import { Apple, ChartColumn, CircleUserRound, Dumbbell, House } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { usePageNavigate } from '../../utils/usePageNavigate'
import '../../styles/glass-dock.css'

type DockItem = { path: string; label: string; Icon: LucideIcon }

const items: DockItem[] = [
  { path: '/', label: 'Home', Icon: House },
  { path: '/workouts', label: 'Workouts', Icon: Dumbbell },
  { path: '/workouts/statistics', label: 'Statistics', Icon: ChartColumn },
  { path: '/nutrition', label: 'Nutrition', Icon: Apple },
  { path: '/profile', label: 'Profile', Icon: CircleUserRound },
]

export default function GlassDock() {
  const navigate = usePageNavigate()
  const { pathname } = useLocation()
  // The longest matching path wins, so /workouts/statistics marks Statistics, not Workouts.
  const active = items.reduce((best, { path }, index) => {
    const matches = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
    return matches && path.length > items[best].path.length ? index : best
  }, 0)

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
            // Tabs slide in the dock's order: a tab to the right comes in from the right.
            onClick={() => { if (!isActive) navigate(path, { direction: index > active ? 'forward' : 'back' }) }}
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
