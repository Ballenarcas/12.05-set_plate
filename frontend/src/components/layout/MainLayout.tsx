import { Outlet, useLocation } from 'react-router-dom'
import GlassDock from './GlassDock'
import '../../styles/global.css'

function MainLayout() {
  const { pathname } = useLocation()
  const hideDock = pathname.startsWith('/workouts/active')
  return (
    <div className={`app-shell${hideDock ? ' session-shell' : ''}`}>
      <main className={`app-main${hideDock ? ' session-main' : ''}`}><Outlet /></main>
      {hideDock ? null : <GlassDock />}
    </div>
  )
}

export default MainLayout
