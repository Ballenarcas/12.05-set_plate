import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Loader2,
  Plus,
  Search,
  Star,
  Trash2,
  Utensils,
  X,
  Scale,
} from 'lucide-react'
import {
  addMealLog,
  deleteMealLog,
  fetchTodayNutrition,
  getCurrentUser,
  searchFoodItems,
  type FoodSearchItem,
  type MealLogItem,
  type TodayNutritionData,
} from '../services/api'
import { summarizeMeal } from '../utils/mealComposition.js'
import '../styles/log-meals.css'

type PlateFood = {
  name: string
  quantityGrams: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export function LogMeals() {
  const navigate = useNavigate()
  const currentUser = getCurrentUser()

  // 1. Session check: redirect to /login if unauthenticated
  useEffect(() => {
    if (!currentUser?.id) {
      navigate('/login')
    }
  }, [currentUser, navigate])

  const [isLoading, setIsLoading] = useState(true)
  const [nutritionData, setNutritionData] = useState<TodayNutritionData | null>(null)
  const [mealList, setMealList] = useState<MealLogItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Modal & Register state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [foodInput, setFoodInput] = useState('')
  const [quantityGrams, setQuantityGrams] = useState('100')
  const [plateFoods, setPlateFoods] = useState<PlateFood[]>([])
  const [mealType, setMealType] = useState('Breakfast')
  const [selectedFoodDensity, setSelectedFoodDensity] = useState<{
    caloriesPer100g: number
    proteinPer100g: number
    carbsPer100g: number
    fatPer100g: number
  }>({
    caloriesPer100g: 130,
    proteinPer100g: 8,
    carbsPer100g: 15,
    fatPer100g: 3.5,
  })

  // Food suggestions state
  const [suggestions, setSuggestions] = useState<FoodSearchItem[]>([])
  const [isFoodSearchOpen, setIsFoodSearchOpen] = useState(false)
  const [foodSearchMessage, setFoodSearchMessage] = useState<string | null>(null)
  const [isSearchingFoods, setIsSearchingFoods] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // 2. Fetch today's nutrition from database
  useEffect(() => {
    if (!currentUser?.id) return

    let isMounted = true
    setIsLoading(true)

    fetchTodayNutrition(currentUser.id)
      .then((data) => {
        if (!isMounted) return
        setNutritionData(data)
        setMealList(data.meals)
        setErrorMessage(null)
      })
      .catch((err: Error) => {
        if (!isMounted) return
        setErrorMessage(err.message || 'Unable to load nutrition data from database')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [currentUser?.id])

  // 3. Search suggestions as user types in modal
  useEffect(() => {
    if (!isModalOpen || !isFoodSearchOpen) return

    let isCurrent = true
    const timer = setTimeout(() => {
      setIsSearchingFoods(true)
      setFoodSearchMessage(null)
      searchFoodItems(foodInput.trim())
        .then((items) => {
          if (!isCurrent) return
          setSuggestions(items)
          setFoodSearchMessage(items.length === 0 ? 'No foods found. Try another search.' : null)
        })
        .catch((err: unknown) => {
          if (!isCurrent) return
          setSuggestions([])
          setFoodSearchMessage(err instanceof Error ? err.message : 'Food search is unavailable.')
        })
        .finally(() => {
          if (isCurrent) setIsSearchingFoods(false)
        })
    }, 200)

    return () => {
      isCurrent = false
      clearTimeout(timer)
    }
  }, [foodInput, isFoodSearchOpen, isModalOpen])

  // 4. Live Automatic Nutrition Calculation (User NEVER inputs calories manually)
  const calculatedNutrition = useMemo(() => {
    const qty = Math.max(1, parseFloat(quantityGrams) || 100)
    const ratio = qty / 100
    return {
      calories: Math.round(selectedFoodDensity.caloriesPer100g * ratio),
      protein: Math.round(selectedFoodDensity.proteinPer100g * ratio * 10) / 10,
      carbs: Math.round(selectedFoodDensity.carbsPer100g * ratio * 10) / 10,
      fat: Math.round(selectedFoodDensity.fatPer100g * ratio * 10) / 10,
    }
  }, [quantityGrams, selectedFoodDensity])

  const plateNutrition = useMemo(() => summarizeMeal(plateFoods), [plateFoods])

  const handleBack = () => {
    navigate(-1)
  }

  const handleSelectSuggestion = (item: FoodSearchItem) => {
    setIsFoodSearchOpen(false)
    setFoodInput(item.name)
    setSelectedFoodDensity({
      caloriesPer100g: item.calories_per_100g,
      proteinPer100g: item.proteins_per_100g,
      carbsPer100g: item.carbs_per_100g,
      fatPer100g: item.fats_per_100g,
    })
    setSuggestions([])
    setFoodSearchMessage(null)
  }

  const handleAddFood = () => {
    if (!foodInput.trim()) return
    const quantity = Math.max(1, parseFloat(quantityGrams) || 100)
    setPlateFoods((foods) => [...foods, {
      name: foodInput.trim(),
      quantityGrams: quantity,
      ...calculatedNutrition,
    }])
    setFoodInput('')
    setQuantityGrams('100')
    setSelectedFoodDensity({ caloriesPer100g: 130, proteinPer100g: 8, carbsPer100g: 15, fatPer100g: 3.5 })
    setSuggestions([])
    setIsFoodSearchOpen(false)
    setFoodSearchMessage(null)
  }

  const handleOpenModal = () => {
    setFoodInput('')
    setQuantityGrams('100')
    setPlateFoods([])
    setSelectedFoodDensity({ caloriesPer100g: 130, proteinPer100g: 8, carbsPer100g: 15, fatPer100g: 3.5 })
    setIsFoodSearchOpen(false)
    setSuggestions([])
    setFoodSearchMessage(null)
    setErrorMessage(null)
    // Pre-select meal type based on hour
    const currentHour = new Date().getHours()
    if (currentHour < 11) setMealType('Breakfast')
    else if (currentHour < 16) setMealType('Lunch')
    else if (currentHour < 19) setMealType('Snack')
    else setMealType('Dinner')

    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (!isSubmitting) {
      setIsModalOpen(false)
      setIsFoodSearchOpen(false)
      setErrorMessage(null)
    }
  }

  // 5. Submit new meal: auto-calculated calories & macros saved to database
  const handleSaveMeal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (plateFoods.length === 0) return
    if (!currentUser?.id) {
      navigate('/login')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const createdMeal = await addMealLog({
        user_id: currentUser.id,
        name: plateFoods.map((food) => food.name).join(' + '),
        calories: plateNutrition.calories,
        quantity_g: plateNutrition.quantityGrams,
        meal_type: mealType,
        proteins: Math.round(plateNutrition.protein * 10) / 10,
        carbs: Math.round(plateNutrition.carbs * 10) / 10,
        fats: Math.round(plateNutrition.fat * 10) / 10,
      })

      // Dynamically update metrics
      setMealList((prev) => [createdMeal, ...prev])
      setNutritionData((prev) => {
        if (!prev) return null
        const newConsumed = prev.consumed_calories + plateNutrition.calories
        const newProgress = prev.daily_goal > 0 ? Math.round((newConsumed / prev.daily_goal) * 100) : 0
        return {
          ...prev,
          consumed_calories: newConsumed,
          calories_progress_percentage: Math.min(100, Math.max(0, newProgress)),
          carbs_g: Math.round(((prev.carbs_g || 0) + plateNutrition.carbs) * 10) / 10,
          proteins_g: Math.round(((prev.proteins_g || 0) + plateNutrition.protein) * 10) / 10,
          fats_g: Math.round(((prev.fats_g || 0) + plateNutrition.fat) * 10) / 10,
        }
      })

      setIsModalOpen(false)
      setIsFoodSearchOpen(false)
      setFoodInput('')
      setPlateFoods([])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save meal'
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 6. Delete meal item
  const handleDeleteMeal = async (mealId: string) => {
    const targetMeal = mealList.find((meal) => meal.id === mealId)
    if (!targetMeal) return

    try {
      if (mealId) {
        await deleteMealLog(mealId)
      }
      setMealList((prev) => prev.filter((meal) => meal.id !== mealId))
      setNutritionData((prev) => {
        if (!prev) return null
        const newConsumed = Math.max(0, prev.consumed_calories - (targetMeal.item_calories || 0))
        const newProgress = prev.daily_goal > 0 ? Math.round((newConsumed / prev.daily_goal) * 100) : 0
        return {
          ...prev,
          consumed_calories: newConsumed,
          calories_progress_percentage: Math.min(100, Math.max(0, newProgress)),
        }
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete meal'
      setErrorMessage(msg)
    }
  }

  // Search filter for today's logs
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredMeals = mealList.filter((meal) =>
    `${meal.meal_name} ${meal.meal_type}`.toLocaleLowerCase().includes(normalizedSearchQuery)
  )

  const consumedCaloriesText = nutritionData ? nutritionData.consumed_calories.toLocaleString() : '-'
  const dailyGoalText = nutritionData ? nutritionData.daily_goal.toLocaleString() : '-'
  const carbsText = nutritionData && nutritionData.carbs_g !== undefined ? `${nutritionData.carbs_g}` : '-'
  const proteinsText = nutritionData && nutritionData.proteins_g !== undefined ? `${nutritionData.proteins_g}` : '-'
  const fatsText = nutritionData && nutritionData.fats_g !== undefined ? `${nutritionData.fats_g}` : '-'
  const progressPercent = nutritionData ? Math.min(Math.max(nutritionData.calories_progress_percentage, 0), 100) : 0

  return (
    <div className="log-meals-container">
      <div className="log-meals-content">
        {/* 1. HEADER */}
        <header className="log-meals-header">
          <button
            type="button"
            className="btn-header-circle"
            onClick={handleBack}
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>

          <h1 className="log-meals-title">Log Meals</h1>

          <button
            type="button"
            className="btn-star-circle"
            aria-label="Saved Meals"
          >
            <Star size={17} strokeWidth={1.5} />
          </button>
        </header>

        {/* 2. SEARCH BAR */}
        <div className="search-wrapper">
          <Search size={18} className="search-icon" aria-hidden="true" />
          <input
            type="text"
            className="search-input"
            placeholder="Search today's meals"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* 3. DAILY SUMMARY CARD */}
        <section className="daily-summary-card" aria-label="Daily Calorie Summary">
          <span className="summary-header">TODAY CALORIES</span>

          <div className="summary-metrics-row">
            <span className="main-calorie-metric">
              {consumedCaloriesText} / {dailyGoalText} kcal
            </span>

          </div>

          <div
            className="progress-track"
            role="progressbar"
            aria-label="Calorie progress"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="macros-row">
            <div className="macro-pill">Carbs: {carbsText}g</div>
            <div className="macro-pill">Proteins: {proteinsText}g</div>
            <div className="macro-pill">Fats: {fatsText}g</div>
          </div>
        </section>

        {/* 4. NEW REGISTER ACTION */}
        <section className="new-register-card" aria-label="New Food Register">
          <div className="new-register-header-group">
            <div>
              <h2 className="card-title">New Register</h2>
              <p className="card-subtitle">Log what you just ate with automatic calorie and macro calculation.</p>
            </div>
            <button
              type="button"
              className="btn-add-register"
              onClick={handleOpenModal}
            >
              <Plus size={18} aria-hidden="true" />
              Add Register
            </button>
          </div>
        </section>

        {/* 5. TODAY CONSUMPTION LIST */}
        <section className="consumption-section" aria-label="Today Consumption">
          <div className="consumption-header">
            <h2 className="consumption-title">Today consumption</h2>
            <button
              type="button"
              className="see-all-link"
              onClick={() => navigate('/nutrition')}
            >
              See all
            </button>
          </div>

          {isLoading ? (
            <div className="loading-indicator">
              <Loader2 size={18} className="animate-spin" />
              <span>Loading meals from database...</span>
            </div>
          ) : filteredMeals.length === 0 ? (
            <div className="empty-meals-card">
              {searchQuery ? 'No meals found matching your search.' : 'No meals logged yet today. Press Add Register above to log your first meal!'}
            </div>
          ) : (
            <div className="consumption-list">
              {filteredMeals.map((meal, index) => (
                <div
                  key={meal.id ?? index}
                  className="consumption-item-card"
                >
                  <div className="item-left">
                    <div className="food-icon-badge" aria-hidden="true">
                      <Utensils size={18} />
                    </div>

                    <div className="item-text">
                      <span className="meal-name">{meal.meal_name || '-'}</span>
                      <span className="meal-details">
                        {meal.meal_type || 'Meal'} • {meal.portion_amount || '1'} portion ({meal.weight_g || '100'}g)
                      </span>
                    </div>
                  </div>

                  <div className="item-right">
                    <span className="item-calories">
                      {meal.item_calories !== undefined && meal.item_calories !== null ? `${meal.item_calories} kcal` : '-'}
                    </span>
                    <button
                      type="button"
                      className="btn-delete-item"
                      onClick={() => handleDeleteMeal(meal.id)}
                      aria-label={`Delete ${meal.meal_name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* POPUP MODAL: INPUT MEAL & AUTOMATIC CALORIE CALCULATION */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-meal-title"
          >
            <div className="modal-header">
              <h2 id="modal-meal-title" className="modal-title">Log Meal</h2>
              <button
                type="button"
                className="btn-modal-close"
                onClick={handleCloseModal}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveMeal} className="modal-form">
              {/* Food Input with Live Autocomplete */}
              <div className="form-group" style={{ position: 'relative' }}>
                <label htmlFor="foodInput" className="form-label">
                    Add a food
                </label>
                <div className="input-with-icon">
                  <input
                    id="foodInput"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Chicken breast, rice..."
                    value={foodInput}
                    onChange={(e) => {
                      setFoodInput(e.target.value)
                      setIsFoodSearchOpen(true)
                      setFoodSearchMessage(null)
                      setSelectedFoodDensity({ caloriesPer100g: 130, proteinPer100g: 8, carbsPer100g: 15, fatPer100g: 3.5 })
                    }}
                    onFocus={() => setIsFoodSearchOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsFoodSearchOpen(false)
                        setSuggestions([])
                        setFoodSearchMessage(null)
                      }
                    }}
                    autoFocus
                    autoComplete="off"
                  />
                  {isSearchingFoods && (
                    <Loader2 size={16} className="animate-spin input-spinner" />
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {isFoodSearchOpen && suggestions.length > 0 && (
                  <ul className="suggestions-list">
                    <li className="suggestions-dismiss-row">
                      <button type="button" onClick={() => {
                        setIsFoodSearchOpen(false)
                        setSuggestions([])
                      }}>
                        Close suggestions <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                    {suggestions.map((item) => (
                      <li
                        key={item.id}
                        className="suggestion-item"
                        onClick={() => handleSelectSuggestion(item)}
                      >
                        <span className="suggestion-name">{item.name}</span>
                        <span className="suggestion-cals">{item.calories_per_100g} kcal / 100g</span>
                      </li>
                    ))}
                  </ul>
                )}
                {isFoodSearchOpen && foodSearchMessage && (
                  <p className="food-search-message" role="status">{foodSearchMessage}</p>
                )}
              </div>

              {/* Meal Type Selection */}
              <div className="form-group">
                <label className="form-label">Meal Type</label>
                <div className="meal-type-selector">
                  {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`meal-type-chip${mealType === type ? ' is-selected' : ''}`}
                      onClick={() => setMealType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity in Grams */}
              <div className="form-group">
                <div className="label-with-presets">
                  <label htmlFor="quantityGrams" className="form-label">
                    Portion Weight (g)
                  </label>
                  <div className="quick-qty-chips">
                    {['50', '100', '150', '200', '250'].map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`qty-preset-btn${quantityGrams === g ? ' is-active' : ''}`}
                        onClick={() => setQuantityGrams(g)}
                      >
                        {g}g
                      </button>
                    ))}
                  </div>
                </div>

                <div className="input-with-suffix">
                  <input
                    id="quantityGrams"
                    type="number"
                    min="1"
                    className="form-input"
                    placeholder="100"
                    value={quantityGrams}
                    onChange={(e) => setQuantityGrams(e.target.value)}
                    required
                  />
                  <span className="input-suffix">
                    <Scale size={16} aria-hidden="true" /> grams
                  </span>
                </div>
              </div>

              {/* LIVE AUTO-CALCULATION BREAKDOWN (User does NOT type calories!) */}
              <div className="calculation-preview-card">
                <div className="calc-header-row">
                  <span className="calc-label">Calculated Nutrition</span>
                  <span className="calc-cals-badge">{calculatedNutrition.calories} kcal</span>
                </div>
                <div className="calc-macros-grid">
                  <div className="calc-macro-item">
                    <span className="macro-name">Protein</span>
                    <span className="macro-num">{calculatedNutrition.protein}g</span>
                  </div>
                  <div className="calc-macro-item">
                    <span className="macro-name">Carbs</span>
                    <span className="macro-num">{calculatedNutrition.carbs}g</span>
                  </div>
                  <div className="calc-macro-item">
                    <span className="macro-name">Fat</span>
                    <span className="macro-num">{calculatedNutrition.fat}g</span>
                  </div>
                </div>
                <p className="calc-disclaimer">
                  Computed automatically from food database density per {quantityGrams || 100}g portion.
                </p>
              </div>

              <button type="button" className="btn-add-food" onClick={handleAddFood} disabled={!foodInput.trim()}>
                <Plus size={16} aria-hidden="true" /> Add food to meal
              </button>

              <section className="plate-foods" aria-label="Foods in this meal">
                <div className="calc-header-row">
                  <span className="calc-label">This meal</span>
                  <span className="plate-food-count">{plateFoods.length} {plateFoods.length === 1 ? 'food' : 'foods'}</span>
                </div>
                {plateFoods.length === 0 ? (
                  <p className="calc-disclaimer">Add each food and its portion to build one meal.</p>
                ) : (
                  <>
                    <ul className="plate-food-list">
                      {plateFoods.map((food, index) => (
                        <li className="plate-food-row" key={`${food.name}-${index}`}>
                          <span>{food.name} <small>{food.quantityGrams}g · {food.calories} kcal</small></span>
                          <button type="button" onClick={() => setPlateFoods((foods) => foods.filter((_, i) => i !== index))} aria-label={`Remove ${food.name}`}>
                            <X size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="plate-total-row"><span>Meal total · {plateNutrition.quantityGrams}g</span><strong>{plateNutrition.calories} kcal</strong></div>
                  </>
                )}
              </section>

              {errorMessage && (
                <p className="field-hint" style={{ color: '#f87171', margin: 0 }}>
                  {errorMessage}
                </p>
              )}

              {/* Modal Submit Button */}
              <button
                type="submit"
                className="btn-modal-submit"
                disabled={isSubmitting || plateFoods.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : (
                  'Save Meal'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default LogMeals
