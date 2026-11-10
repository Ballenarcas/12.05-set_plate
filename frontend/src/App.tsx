import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import { getCurrentUser, prefetchMainPages } from './services/api'

const pages = {
  Home: () => import('./pages/Home'),
  ActiveWorkout: () => import('./pages/ActiveWorkout'),
  CreateRoutine: () => import('./pages/CreateRoutine'),
  ExercisePicker: () => import('./pages/ExercisePicker'),
  Login: () => import('./pages/Login'),
  LogMeals: () => import('./pages/LogMeals'),
  Nutrition: () => import('./pages/Nutrition'),
  Onboarding: () => import('./pages/Onboarding'),
  Premium: () => import('./pages/Premium'),
  Profile: () => import('./pages/Profile'),
  Faq: () => import('./pages/Faq'),
  Welcome: () => import('./pages/Welcome'),
  Workouts: () => import('./pages/Workouts'),
  WorkoutStatistics: () => import('./pages/WorkoutStatistics'),
}

// Load the other pages in the background, so switching pages never waits on a download. It starts
// a few seconds after the app has loaded, so it never competes with the first page's own data.
if (typeof window !== 'undefined') {
  const preload = () => {
    Object.values(pages).forEach((load) => { void load().catch(() => undefined) })
    prefetchMainPages()
  }
  const later = () => window.setTimeout(() => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 5000 })
    else preload()
  }, 3000)
  if (document.readyState === 'complete') later()
  else window.addEventListener('load', later, { once: true })
}

const Home = lazy(pages.Home)
const ActiveWorkout = lazy(pages.ActiveWorkout)
const CreateRoutine = lazy(pages.CreateRoutine)
const ExercisePicker = lazy(pages.ExercisePicker)
const Login = lazy(pages.Login)
const LogMeals = lazy(pages.LogMeals)
const Nutrition = lazy(pages.Nutrition)
const Onboarding = lazy(pages.Onboarding)
const Premium = lazy(pages.Premium)
const Profile = lazy(pages.Profile)
const Faq = lazy(pages.Faq)
const Welcome = lazy(pages.Welcome)
const Workouts = lazy(pages.Workouts)
const WorkoutStatistics = lazy(pages.WorkoutStatistics)

function ProtectedLayout() {
  return getCurrentUser()?.id ? <MainLayout /> : <Navigate to="/welcome" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<p className="visually-hidden" role="status" data-page-loading>Loading screen…</p>}>
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
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App