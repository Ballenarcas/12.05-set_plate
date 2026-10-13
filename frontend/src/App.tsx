import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import { getCurrentUser } from './services/api'

const Home = lazy(() => import('./pages/Home'))
const ActiveWorkout = lazy(() => import('./pages/ActiveWorkout'))
const ExercisePicker = lazy(() => import('./pages/ExercisePicker'))
const Nutrition = lazy(() => import('./pages/Nutrition'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Settings = lazy(() => import('./pages/Settings'))
const Welcome = lazy(() => import('./pages/Welcome'))
const Workouts = lazy(() => import('./pages/Workouts'))

function ProtectedLayout() {
  return getCurrentUser()?.id ? <MainLayout /> : <Navigate to="/welcome" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="screen state-card" role="status">Loading screen…</div>}>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/workouts" element={<Workouts />} />
            <Route path="/workouts/active" element={<ActiveWorkout />} />
            <Route path="/workouts/active/exercises" element={<ExercisePicker />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
