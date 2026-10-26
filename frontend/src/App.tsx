import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import { getCurrentUser } from './services/api'

const Home = lazy(() => import('./pages/Home'))
const ActiveWorkout = lazy(() => import('./pages/ActiveWorkout'))
const CreateRoutine = lazy(() => import('./pages/CreateRoutine'))
const ExercisePicker = lazy(() => import('./pages/ExercisePicker'))
const Login = lazy(() => import('./pages/Login'))
const LogMeals = lazy(() => import('./pages/LogMeals'))
const Nutrition = lazy(() => import('./pages/Nutrition'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Premium = lazy(() => import('./pages/Premium'))
const Settings = lazy(() => import('./pages/Settings'))
const Welcome = lazy(() => import('./pages/Welcome'))
const Workouts = lazy(() => import('./pages/Workouts'))
const WorkoutStatistics = lazy(() => import('./pages/WorkoutStatistics'))

function ProtectedLayout() {
  return getCurrentUser()?.id ? <MainLayout /> : <Navigate to="/welcome" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="screen state-card" role="status">Loading screen…</div>}>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/log-meals" element={<LogMeals />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/workouts" element={<Workouts />} />
            <Route path="/workouts/statistics" element={<WorkoutStatistics />} />
            <Route path="/workouts/create" element={<CreateRoutine />} />
            <Route path="/workouts/active" element={<ActiveWorkout />} />
            <Route path="/workouts/active/exercises" element={<ExercisePicker />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/premium" element={<Premium />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App;
