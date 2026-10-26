import { Outlet, useLocation } from 'react-router-dom'
import GlassDock from './GlassDock'
import WorkoutInProgressBar from './WorkoutInProgressBar'
import '../../styles/global.css'

function MainLayout() {
  const { pathname } = useLocation()
  const hideDock = pathname.startsWith('/workouts/active') || pathname === '/premium'
  return (
    <div className={`app-shell${hideDock ? ' session-shell' : ''}`}>
      <main className={`app-main${hideDock ? ' session-main' : ''}`}><Outlet /></main>
      {hideDock ? null : <>
        <WorkoutInProgressBar />
        <GlassDock />
      </>}
    </div>
  )
}

export default MainLayout
