import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  addMealLog,
  getCurrentUser,
  scanMealPhoto,
  type MealScanItem,
} from '../services/api'
import { describeError } from '../utils/errors.js'
import '../styles/scan-meal.css'

type ScanPhase = 'idle' | 'analyzing' | 'results' | 'saving' | 'error'

interface EditableItem {
  key: string
  name: string
  grams: string
  calories: string
  protein: string
  carbs: string
  fat: string
}

function itemKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random()}`
}

function numberValue(value: string): number {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function editableItem(item: MealScanItem): EditableItem {
  return {
    key: itemKey(),
    name: item.name,
    grams: String(item.grams),
    calories: String(item.calories),
    protein: String(item.protein_g),
    carbs: String(item.carbs_g),
    fat: String(item.fat_g),
  }
}

function per100(total: number, grams: number, maximum: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(grams) || grams <= 0) return 0
  return Math.max(0, Math.min(maximum, Math.round(((total / grams) * 100) * 10) / 10))
}

async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const maximumSide = 1600
  const scale = Math.min(1, maximumSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Could not read that photo.')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare that photo.'))),
      'image/jpeg',
      0.85,
    )
  })
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function ScanMeal() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const imageUrlRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<ScanPhase>('idle')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [items, setItems] = useState<EditableItem[]>([])
  const [mealName, setMealName] = useState('Scanned meal')
  const [notes, setNotes] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  useEffect(() => () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
  }, [])

  const totalCalories = useMemo(
    () => Math.round(items.reduce((sum, item) => sum + numberValue(item.calories), 0)),
    [items],
  )
  const canSave = items.length > 0 && items.every((item) => (
    item.name.trim().length > 0
    && numberValue(item.grams) > 0
    && numberValue(item.calories) >= 0
  ))

  const setPreview = (blob: Blob) => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
    const url = URL.createObjectURL(blob)
    imageUrlRef.current = url
    setImageUrl(url)
  }

  const analyze = async (blob: Blob) => {
    setPhase('analyzing')
    setError(null)
    setItems([])
    setNotes(null)
    try {
      const result = await scanMealPhoto(blob)
      const detected = result.items.map(editableItem)
      const suggestedName = result.items.slice(0, 2).map((item) => item.name).join(' + ')
      setItems(detected)
      setNotes(result.notes)
      setMealName((suggestedName || 'Scanned meal').slice(0, 120))
      setPhase('results')
    } catch (err) {
      setError(describeError(err, "We couldn't analyze that photo. Please try again."))
      setPhase('error')
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.type && !file.type.startsWith('image/')) {
      setError('Choose a photo file, not a document.')
      setPhase('idle')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('That photo is too large. Choose one under 20 MB.')
      setPhase('idle')
      return
    }
    setPhase('analyzing')
    try {
      const blob = await prepareImage(file)
      if (blob.size > 8 * 1024 * 1024) {
        throw new Error('That photo is still too large after resizing. Choose another one.')
      }
      setImageBlob(blob)
      setPreview(blob)
      await analyze(blob)
    } catch (err) {
      setError(describeError(err, "We couldn't read that photo. Try another one."))
      setPhase('error')
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    void handleFile(file)
  }

  const handleRetake = () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
    imageUrlRef.current = null
    setImageUrl(null)
    setImageBlob(null)
    setItems([])
    setNotes(null)
    setError(null)
    setExpandedKey(null)
    setPhase('idle')
  }

  const handleTryAgain = () => {
    if (imageBlob) void analyze(imageBlob)
  }

  const updateItem = (key: string, field: keyof Omit<EditableItem, 'key'>, value: string) => {
    setItems((current) => current.map((item) => (
      item.key === key ? { ...item, [field]: value } : item
    )))
  }

  const stepGrams = (item: EditableItem, delta: number) => {
    const next = Math.max(1, Math.min(5000, Math.round(numberValue(item.grams) + delta)))
    updateItem(item.key, 'grams', String(next))
  }

  const addItem = () => {
    const key = itemKey()
    setItems((current) => [
      ...current,
      { key, name: 'New item', grams: '100', calories: '0', protein: '0', carbs: '0', fat: '0' },
    ])
    setExpandedKey(key)
  }

  const removeItem = (key: string) => {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  const handleConfirm = async () => {
    if (!user?.id) {
      setError('Sign in again before logging a meal.')
      return
    }
    if (!canSave) {
      setError('Add at least one item with a name and a weight.')
      return
    }
    setPhase('saving')
    setError(null)
    try {
      const ingredients = items.map((item) => {
        const grams = Math.max(0.1, Math.min(10000, numberValue(item.grams)))
        const calories = Math.max(0, numberValue(item.calories))
        const protein = Math.max(0, numberValue(item.protein))
        const carbs = Math.max(0, numberValue(item.carbs))
        const fat = Math.max(0, numberValue(item.fat))
        return {
          name: item.name.trim().slice(0, 120),
          quantity_g: Math.round(grams * 10) / 10,
          calories_per_100g: per100(calories, grams, 1000),
          proteins_per_100g: per100(protein, grams, 100),
          carbs_per_100g: per100(carbs, grams, 100),
          fats_per_100g: per100(fat, grams, 100),
        }
      })
      await addMealLog({
        user_id: user.id,
        name: mealName.trim().slice(0, 120) || 'Scanned meal',
        ingredients,
      })
      navigate('/nutrition', { replace: true })
    } catch (err) {
      setError(describeError(err, "We couldn't save this meal. Please try again."))
      setPhase('results')
    }
  }

  const showPreview = Boolean(imageUrl) && phase !== 'idle'

  return (
    <div className="screen scan-screen">
      <header className="scan-header">
        <button className="scan-back" type="button" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <h1>{phase === 'results' || phase === 'saving' ? 'Scan results' : 'Scan meal'}</h1>
        <span className="scan-date">{todayLabel()}</span>
      </header>

      {phase === 'idle' && (
        <section className="scan-capture" aria-labelledby="scan-capture-title">
          <div className="scan-camera-card">
            <span className="scan-camera-icon" aria-hidden="true"><Camera size={42} /></span>
            <h2 id="scan-capture-title">Snap your plate</h2>
            <p>Take a clear photo of the whole meal. The AI estimates each ingredient, its weight, and its calories.</p>
            <button type="button" className="scan-primary" onClick={() => cameraInputRef.current?.click()}>
              <Camera size={19} aria-hidden="true" /> Open camera
            </button>
            <button type="button" className="scan-secondary" onClick={() => galleryInputRef.current?.click()}>
              <ImagePlus size={19} aria-hidden="true" /> Choose from gallery
            </button>
            <p className="scan-privacy">Your photo is sent to the AI provider only to estimate this meal.</p>
          </div>
          {error && <p className="scan-error" role="alert">{error}</p>}
        </section>
      )}

      {phase === 'error' && !imageUrl && (
        <section className="scan-capture" aria-label="Photo error">
          <div className="scan-error-card" role="alert">
            <p>{error}</p>
            <div className="scan-error-actions">
              <button type="button" className="scan-secondary" onClick={handleRetake}>
                Choose another photo
              </button>
            </div>
          </div>
        </section>
      )}

      {showPreview && (
        <section className="scan-preview" aria-label="Meal photo preview">
          <img src={imageUrl ?? ''} alt="Meal to analyze" className="scan-image" />
          <button type="button" className="scan-retake" onClick={handleRetake}>
            <RotateCcw size={16} aria-hidden="true" /> Retake
          </button>
          {phase === 'analyzing' && (
            <div className="scan-loading" role="status">
              <Loader2 size={22} className="animate-spin" aria-hidden="true" />
              <div>
                <strong>Analyzing your meal</strong>
                <span>This usually takes a few seconds.</span>
              </div>
            </div>
          )}
          {phase === 'error' && (
            <div className="scan-error-card" role="alert">
              <p>{error}</p>
              <div className="scan-error-actions">
                {imageBlob && (
                  <button type="button" className="scan-secondary" onClick={handleTryAgain}>
                    <Sparkles size={16} aria-hidden="true" /> Try again
                  </button>
                )}
                <button type="button" className="scan-secondary" onClick={handleRetake}>
                  Choose another photo
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {(phase === 'results' || phase === 'saving') && (
        <>
          <section className="scan-name-card" aria-labelledby="scan-name-label">
            <label id="scan-name-label" htmlFor="scan-meal-name">Meal name</label>
            <input
              id="scan-meal-name"
              value={mealName}
              maxLength={120}
              onChange={(event) => setMealName(event.target.value)}
            />
          </section>

          {notes && <p className="scan-notes"><Sparkles size={15} aria-hidden="true" /> {notes}</p>}

          <section className="scan-detected" aria-labelledby="scan-detected-title">
            <div className="scan-section-heading">
              <h2 id="scan-detected-title">Detected items</h2>
              <span>Tap to edit</span>
            </div>
            <div className="scan-items">
              {items.map((item) => {
                const expanded = expandedKey === item.key
                return (
                  <article className="scan-item" key={item.key}>
                    <div className="scan-item-top">
                      <input
                        className="scan-item-name"
                        value={item.name}
                        maxLength={120}
                        aria-label={`Name for ${item.name || 'item'}`}
                        onChange={(event) => updateItem(item.key, 'name', event.target.value)}
                      />
                      <button
                        type="button"
                        className="scan-remove"
                        onClick={() => removeItem(item.key)}
                        aria-label={`Remove ${item.name || 'item'}`}
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="scan-item-controls">
                      <div className="scan-stepper">
                        <button type="button" onClick={() => stepGrams(item, -10)} aria-label={`Decrease ${item.name} weight`}>
                          <Minus size={15} aria-hidden="true" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="5000"
                          value={item.grams}
                          aria-label={`${item.name} weight in grams`}
                          onChange={(event) => updateItem(item.key, 'grams', event.target.value)}
                        />
                        <span>g</span>
                        <button type="button" onClick={() => stepGrams(item, 10)} aria-label={`Increase ${item.name} weight`}>
                          <Plus size={15} aria-hidden="true" />
                        </button>
                      </div>
                      <label className="scan-calories">
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={item.calories}
                          aria-label={`${item.name} calories`}
                          onChange={(event) => updateItem(item.key, 'calories', event.target.value)}
                        />
                        <span>kcal</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="scan-macros-toggle"
                      onClick={() => setExpandedKey(expanded ? null : item.key)}
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                      Macros
                    </button>
                    {expanded && (
                      <div className="scan-macros">
                        <label>Protein (g)<input type="number" min="0" value={item.protein} onChange={(event) => updateItem(item.key, 'protein', event.target.value)} /></label>
                        <label>Carbs (g)<input type="number" min="0" value={item.carbs} onChange={(event) => updateItem(item.key, 'carbs', event.target.value)} /></label>
                        <label>Fat (g)<input type="number" min="0" value={item.fat} onChange={(event) => updateItem(item.key, 'fat', event.target.value)} /></label>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
            <button type="button" className="scan-add" onClick={addItem}>
              <Plus size={17} aria-hidden="true" /> Add item
            </button>
          </section>

          <div className="scan-total">
            <span><Flame size={17} aria-hidden="true" /> Total</span>
            <strong>{totalCalories} kcal</strong>
          </div>

          {error && <p className="scan-error" role="alert">{error}</p>}

          <button
            type="button"
            className="scan-confirm"
            onClick={handleConfirm}
            disabled={phase === 'saving' || !canSave}
          >
            {phase === 'saving'
              ? <><Loader2 size={19} className="animate-spin" aria-hidden="true" /> Logging meal...</>
              : <><Check size={20} aria-hidden="true" /> Confirm &amp; log meal</>}
          </button>
        </>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="scan-file-input"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="scan-file-input"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
