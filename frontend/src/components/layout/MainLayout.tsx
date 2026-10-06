import { Apple, Dumbbell, Home as HomeIcon, Settings as SettingsIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import '../../styles/global.css'

type NavigationItem = { label: string; path: string; icon: LucideIcon }

const navigationItems: NavigationItem[] = [
  { label: 'Home', path: '/', icon: HomeIcon },
  { label: 'Workouts', path: '/workouts', icon: Dumbbell },
  { label: 'Nutrition', path: '/nutrition', icon: Apple },
  { label: 'Settings', path: '/settings', icon: SettingsIcon },
]

function MainLayout() {
  return (
    <div className="app-shell">
      <main className="app-main"><Outlet /></main>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {navigationItems.map(({ label, path, icon: Icon }) => (
          <NavLink key={path} to={path} end={path === '/'} className={({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' is-active' : ''}`}>
            <Icon size={21} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default MainLayout
