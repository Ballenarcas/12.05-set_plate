import { ArrowLeft, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchExercises } from '../services/api'
import { describeError } from '../utils/errors.js'
import type { Exercise } from '../types'

const PAGE_SIZE = 30

function ExercisePicker() {
  const navigate = useNavigate()
  const location = useLocation()
  const replaceExerciseIndex = (location.state as { replaceExerciseIndex?: number } | null)?.replaceExerciseIndex
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let isCurrent = true
    setIsLoading(true)
    setError(null)
    
    fetchExercises({ q: debouncedSearch || undefined, page, limit: PAGE_SIZE, compact: true })
      .then((response: any) => {
        if (isCurrent) {
          setExercises(response.items || [])
          setTotal(response.total || 0)
        }
      })
      .catch((requestError: Error) => {
        if (isCurrent) setError(describeError(requestError, "We couldn't load exercises. Please try again."))
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [debouncedSearch, page])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageNumbers = Array.from(new Set([1, page - 1, page, page + 1, pageCount]
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount)))

  function selectExercise(exercise: Exercise) {
    sessionStorage.setItem('set_plate_pending_exercise', JSON.stringify({
      id: exercise.id,
      name: exercise.name,
      images: exercise.images?.slice(0, 1) || [],
      replaceExerciseIndex,
    }))
    navigate('/workouts/active')
  }

  return (
    <div className="screen exercise-picker-screen">
      <header className="picker-header">
        <button className="icon-button" type="button" onClick={() => navigate('/workouts/active')} aria-label="Back to active workout">
          <ArrowLeft size={21} />
        </button>
        <div>
          <p className="eyebrow">Active workout</p>
          <h1>{replaceExerciseIndex === undefined ? 'Add exercise' : 'Replace exercise'}</h1>
        </div>
      </header>

      <label className="picker-search">
        <Search size={18} aria-hidden="true" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
      </label>

      {isLoading && <div className="card state-card" role="status">Loading exercises...</div>}
      {error && <div className="card state-card" role="alert">{error}</div>}
      {!isLoading && !error && exercises.length === 0 && <div className="card state-card">No exercises found.</div>}

      <div className="exercise-picker-list">
        {exercises.map((exercise) => (
          <button className="exercise-picker-item" type="button" key={exercise.id} onClick={() => selectExercise(exercise)}>
            {exercise.images?.[0] ? <img src={exercise.images[0]} alt="" /> : <div className="exercise-image-placeholder" aria-hidden="true">+</div>}
            <span>
              <strong>{exercise.name}</strong>
              <small>{exercise.muscles?.slice(0, 2).join(' · ') || exercise.category}</small>
            </span>
          </button>
        ))}
      </div>

      {!isLoading && !error && pageCount > 1 && (
        <nav className="exercise-pagination" aria-label="Exercise pages">
          <button className="pagination-arrow" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Previous page">
            <ChevronLeft size={17} aria-hidden="true" /> Previous
          </button>
          <div className="pagination-pages">
            {pageNumbers.map((pageNumber, index) => (
              <span className="pagination-page-slot" key={pageNumber}>
                {index > 0 && pageNumber - pageNumbers[index - 1] > 1 && <span className="pagination-ellipsis" aria-hidden="true">…</span>}
                <button className={`pagination-page${pageNumber === page ? ' is-current' : ''}`} type="button" onClick={() => setPage(pageNumber)} aria-current={pageNumber === page ? 'page' : undefined} aria-label={`Page ${pageNumber}`}>
                  {pageNumber}
                </button>
              </span>
            ))}
          </div>
          <button className="pagination-arrow" type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} aria-label="Next page">
            Next <ChevronRight size={17} aria-hidden="true" />
          </button>
          <span className="pagination-count">Page {page} of {pageCount}</span>
        </nav>
      )}
    </div>
  )
}

export default ExercisePicker;