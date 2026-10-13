import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import Home from './pages/Home'
import Login from './pages/Login'
import Nutrition from './pages/Nutrition'
import Onboarding from './pages/Onboarding'
import Settings from './pages/Settings'
import Welcome from './pages/Welcome'
import Workouts from './pages/Workouts'
import { getCurrentUser } from './services/api'

function ProtectedLayout() {
  return getCurrentUser()?.id ? <MainLayout /> : <Navigate to="/welcome" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
