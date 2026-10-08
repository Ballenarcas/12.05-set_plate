import { Outlet } from 'react-router-dom'
import GlassDock from './GlassDock'
import '../../styles/global.css'

function MainLayout() {
  return (
    <div className="app-shell">
      <main className="app-main"><Outlet /></main>
      <GlassDock />
    </div>
  )
}

export default MainLayout
