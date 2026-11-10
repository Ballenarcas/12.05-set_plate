import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Camera, ChevronLeft, ChevronRight, Loader2, PenLine, Plus, Scale, Search, Trash2, X } from 'lucide-react';
import { usePageNavigate } from '../utils/usePageNavigate';
import { deleteMealLog, fetchTodayNutrition, getCurrentUser, getSavedDayNutrition, searchFoodItems, updateMealLog, type TodayNutritionData } from '../services/api';
import DailyIntake from '../components/nutrition/DailyIntake';
import MealDatePicker from '../components/nutrition/MealDatePicker';
import { sameDay } from '../utils/monthGrid';
import type { FoodSearchItem, MealIngredient, MealLogItem } from '../services/api';
import '../styles/log-meals.css';

const DEFAULT_FOOD_DENSITY = {
  calories_per_100g: 130,
  proteins_per_100g: 8,
  carbs_per_100g: 15,
  fats_per_100g: 3.5,
};

const MAX_REASONABLE_QUANTITY_G = 1000;
const FALLBACK_QUANTITY_G = 100;

type HighQuantityWarning =
  | {
    target: 'ingredient';
    index: number;
    name: string;
    previous: number;
    next: number;
  }
  | {
    target: 'new';
    name: string;
    previous: number;
    next: number;
  };

const MAX_DAYS_BACK = 7;

/** YYYY-MM-DD in the phone's own time zone. */
function toInputDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function Nutrition() {
  const navigate = usePageNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // Start from the copy saved earlier in this visit, so the card and list show at once.
  const [cachedToday] = useState(() => getSavedDayNutrition(getCurrentUser()?.id ?? '', toInputDate(new Date())));
  const [meals, setMeals] = useState<MealLogItem[]>(cachedToday?.meals ?? []);
  const [targets, setTargets] = useState<Pick<TodayNutritionData, 'daily_goal' | 'target_proteins_g' | 'target_carbs_g' | 'target_fats_g'> | null>(cachedToday);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const daySwipeRef = useRef<{ x: number; y: number; swiped: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(!cachedToday);
  
  // États pour l'édition et la suppression
  const [editingMeal, setEditingMeal] = useState<MealLogItem | null>(null);
  const [editIngredients, setEditIngredients] = useState<MealIngredient[]>([]);
  const [editMealType, setEditMealType] = useState('Meal');
  const [editFoodName, setEditFoodName] = useState('');
  const [editQuantity, setEditQuantity] = useState('100');
  const [editDensity, setEditDensity] = useState(DEFAULT_FOOD_DENSITY);
  const [foodSuggestions, setFoodSuggestions] = useState<FoodSearchItem[]>([]);
  const [isFoodSearchOpen, setIsFoodSearchOpen] = useState(false);
  const [isSearchingFoods, setIsSearchingFoods] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingMeal, setDeletingMeal] = useState<MealLogItem | null>(null);
  const [isDeletingMeal, setIsDeletingMeal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [highQuantityWarning, setHighQuantityWarning] = useState<HighQuantityWarning | null>(null);
  const ingredientQuantityStartRef = useRef<Record<number, number>>({});
  const newQuantityStartRef = useRef<number>(FALLBACK_QUANTITY_G);

  // SE DÉCLENCHE À CHAQUE CHANGEMENT DE DATE DANS LE CALENDRIER
  useEffect(() => {
    const user = getCurrentUser();
    if (!user?.id) return;

    const formattedDate = toInputDate(selectedDate);
    // Show a saved copy of this day straight away; the request below refreshes it.
    const cached = getSavedDayNutrition(user.id, formattedDate);
    if (cached) {
      setMeals(cached.meals || []);
      setTargets(cached);
    }
    setIsLoading(!cached);

    // On utilise ta nouvelle fonction API qui gère les dates
    fetchTodayNutrition(user.id, formattedDate)
      .then(data => {
        setMeals(data.meals || []);
        setTargets(data);
      })
      .catch(error => {
        console.error("Erreur de chargement des repas:", error);
        setMeals([]);
      })
      .finally(() => setIsLoading(false));
  }, [selectedDate]); // L'ajout de selectedDate ici est la clé du fonctionnement !

  useEffect(() => {
    if (!editingMeal || !isFoodSearchOpen || !editFoodName.trim()) {
      return;
    }

    let isCurrent = true;
    const timer = window.setTimeout(() => {
      setIsSearchingFoods(true);
      searchFoodItems(editFoodName.trim())
        .then((items) => {
          if (isCurrent) setFoodSuggestions(items);
        })
        .catch((error: unknown) => {
          if (isCurrent) setEditError(error instanceof Error ? error.message : 'Food search is unavailable.');
        })
        .finally(() => {
          if (isCurrent) setIsSearchingFoods(false);
        });
    }, 200);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [editingMeal, editFoodName, isFoodSearchOpen]);

  const today = new Date();
  const oldestDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - MAX_DAYS_BACK);
  const canGoBack = !sameDay(selectedDate, oldestDay) && selectedDate > oldestDay;
  const canGoForward = !sameDay(selectedDate, today);
  const moveDay = (step: number) => {
    if (step < 0 ? !canGoBack : !canGoForward) return;
    setSelectedDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + step));
  };


  const formatDateLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateString = date.toLocaleDateString('en-US', options);

    if (date.toDateString() === today.toDateString()) return `Today, ${dateString}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${dateString}`;
    return dateString;
  };

  const openEditModal = (meal: MealLogItem) => {
    setEditingMeal(meal);
    const quantity = Math.max(1, Number(meal.weight_g) || 100);
    setEditIngredients(meal.ingredients?.length ? meal.ingredients.map((ingredient) => ({ ...ingredient })) : [{
      name: meal.meal_name,
      quantity_g: quantity,
      calories_per_100g: meal.item_calories / quantity * 100,
      proteins_per_100g: (meal.proteins_g ?? 0) / quantity * 100,
      carbs_per_100g: (meal.carbs_g ?? 0) / quantity * 100,
      fats_per_100g: (meal.fats_g ?? 0) / quantity * 100,
    }]);
    setEditMealType(meal.meal_type || 'Meal');
    setEditFoodName('');
    setIsFoodSearchOpen(false);
    setIsSearchingFoods(false);
    setEditQuantity('100');
    setEditDensity(DEFAULT_FOOD_DENSITY);
    setEditError(null);
    setHighQuantityWarning(null);
    ingredientQuantityStartRef.current = {};
    newQuantityStartRef.current = FALLBACK_QUANTITY_G;
  };

  const selectFoodSuggestion = (food: FoodSearchItem) => {
    setEditFoodName(food.name);
    setIsFoodSearchOpen(false);
    setIsSearchingFoods(false);
    setEditDensity({
      calories_per_100g: food.calories_per_100g,
      proteins_per_100g: food.proteins_per_100g,
      carbs_per_100g: food.carbs_per_100g,
      fats_per_100g: food.fats_per_100g,
    });
    setFoodSuggestions([]);
  };

  const addEditIngredient = () => {
    const name = editFoodName.trim();
    const quantity = Number(editQuantity);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) return;
    setEditIngredients((current) => [...current, { name, quantity_g: quantity, ...editDensity }]);
    setEditFoodName('');
    setIsFoodSearchOpen(false);
    setIsSearchingFoods(false);
    setEditQuantity('100');
    setEditDensity(DEFAULT_FOOD_DENSITY);
    setFoodSuggestions([]);
  };

  const rememberIngredientQuantityStart = (index: number, quantity: number) => {
    ingredientQuantityStartRef.current[index] = quantity;
  };

  const updateIngredientQuantity = (index: number, rawValue: string) => {
    const ingredient = editIngredients[index];
    if (!ingredient) return;
    const nextQuantity = Number(rawValue);
    setEditIngredients((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, quantity_g: nextQuantity } : item));

    if (!Number.isFinite(nextQuantity)) return;
    if (nextQuantity > MAX_REASONABLE_QUANTITY_G && nextQuantity !== ingredient.quantity_g) {
      const previous = ingredientQuantityStartRef.current[index] ?? ingredient.quantity_g;
      setHighQuantityWarning({
        target: 'ingredient',
        index,
        name: ingredient.name,
        previous: previous > 0 ? previous : FALLBACK_QUANTITY_G,
        next: nextQuantity,
      });
    }
  };

  const rememberNewQuantityStart = () => {
    const quantity = Number(editQuantity);
    newQuantityStartRef.current = Number.isFinite(quantity) && quantity > 0 ? quantity : FALLBACK_QUANTITY_G;
  };

  const updateNewQuantity = (rawValue: string) => {
    const previousQuantity = Number(editQuantity);
    const nextQuantity = Number(rawValue);
    setEditQuantity(rawValue);

    if (!Number.isFinite(nextQuantity)) return;
    if (nextQuantity > MAX_REASONABLE_QUANTITY_G && nextQuantity !== previousQuantity) {
      setHighQuantityWarning({
        target: 'new',
        name: editFoodName.trim() || 'This ingredient',
        previous: newQuantityStartRef.current,
        next: nextQuantity,
      });
    }
  };

  const acceptHighQuantity = () => {
    setHighQuantityWarning(null);
  };

  const rollbackHighQuantity = () => {
    const warning = highQuantityWarning;
    if (!warning) return;
    const previous = Number.isFinite(warning.previous) && warning.previous > 0
      ? warning.previous
      : FALLBACK_QUANTITY_G;

    if (warning.target === 'ingredient') {
      setEditIngredients((current) => current.map((item, itemIndex) =>
        itemIndex === warning.index ? { ...item, quantity_g: previous } : item));
    } else {
      setEditQuantity(String(previous));
    }
    setHighQuantityWarning(null);
  };

  const editNutrition = editIngredients.reduce((total, ingredient) => {
    const ratio = ingredient.quantity_g / 100;
    return {
      quantity: total.quantity + ingredient.quantity_g,
      calories: total.calories + ingredient.calories_per_100g * ratio,
      protein: total.protein + ingredient.proteins_per_100g * ratio,
      carbs: total.carbs + ingredient.carbs_per_100g * ratio,
      fat: total.fat + ingredient.fats_per_100g * ratio,
    };
  }, { quantity: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });

  const confirmEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMeal || highQuantityWarning || editIngredients.length === 0 || editIngredients.some((ingredient) => ingredient.quantity_g <= 0)) return;
    const user = getCurrentUser();
    if (!user?.id) {
      setEditError('Sign in again to update this meal.');
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const updatedMeal = await updateMealLog(user.id, editingMeal.id, {
        name: editIngredients.map((ingredient) => ingredient.name).join(' + '),
        meal_type: editMealType,
        ingredients: editIngredients,
      });
      setMeals((current) => current.map((meal) => meal.id === updatedMeal.id ? updatedMeal : meal));
      setEditingMeal(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "We couldn't update this meal.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingMeal) return;
    const user = getCurrentUser();
    if (!user?.id) {
      setDeleteError('Sign in again to remove this meal.');
      return;
    }
    setIsDeletingMeal(true);
    setDeleteError(null);
    try {
      await deleteMealLog(user.id, deletingMeal.id);
      setMeals((current) => current.filter((meal) => meal.id !== deletingMeal.id));
      setDeletingMeal(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "We couldn't remove this meal.");
    } finally {
      setIsDeletingMeal(false);
    }
  };

  return (
    <div
      className="screen meals-screen"
      // Swipe left or right anywhere on the page to change day.
      onPointerDown={(event) => { daySwipeRef.current = { x: event.clientX, y: event.clientY, swiped: false }; }}
      onPointerUp={(event) => {
        const start = daySwipeRef.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5) {
          start.swiped = true;
          moveDay(dx < 0 ? 1 : -1);
        }
      }}
      onClickCapture={(event) => {
        if (daySwipeRef.current?.swiped) event.stopPropagation();
        daySwipeRef.current = null;
      }}
    >
      <nav className="meal-day-nav" aria-label="Day">
        <button className="subpage-button" type="button" onClick={() => moveDay(-1)} disabled={!canGoBack} aria-label="Previous day">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <button className="meal-day-button" type="button" onClick={() => setIsDatePickerOpen(true)} aria-haspopup="dialog" aria-label={`${formatDateLabel(selectedDate)}. Choose a day`}>
          {formatDateLabel(selectedDate)}
        </button>
        <button className="subpage-button" type="button" onClick={() => moveDay(1)} disabled={!canGoForward} aria-label="Next day">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </nav>

      {isDatePickerOpen && (
        <MealDatePicker
          selected={selectedDate}
          min={oldestDay}
          max={today}
          onSelect={(date) => {
            setSelectedDate(date);
            setIsDatePickerOpen(false);
          }}
          onClose={() => setIsDatePickerOpen(false)}
        />
      )}

      <h1 className="meals-title">Meals</h1>
      <h2 className="meals-subtitle">Daily intake</h2>

      {/* Always drawn, so it never pops in late: it shows its shape while the day loads. */}
      <DailyIntake
        consumed={meals.reduce((total, meal) => total + meal.item_calories, 0)}
        goal={targets?.daily_goal ?? 0}
        pending={!targets}
        macros={[
          { label: 'Protein', current: meals.reduce((total, meal) => total + (meal.proteins_g ?? 0), 0), target: targets?.target_proteins_g ?? 0 },
          { label: 'Carbs', current: meals.reduce((total, meal) => total + (meal.carbs_g ?? 0), 0), target: targets?.target_carbs_g ?? 0 },
          { label: 'Fat', current: meals.reduce((total, meal) => total + (meal.fats_g ?? 0), 0), target: targets?.target_fats_g ?? 0 },
        ]}
      />

      <h2 className="meals-subtitle meal-list-title">{sameDay(selectedDate, today) ? "Today's meals" : 'Meals this day'}</h2>

      <div className="meal-list">
        {isLoading ? (
          <p className="visually-hidden" role="status">Loading your meals...</p>
        ) : meals.length === 0 ? (
          <p className="state-line">No meals recorded for this day.</p>
        ) : (
          meals.map((meal) => (
            <button className="meal-row" type="button" key={meal.id} onClick={() => openEditModal(meal)} aria-label={`${meal.meal_type}: ${meal.meal_name}, ${meal.item_calories} kcal. Edit`}>
              <span className="meal-row-text">
                <strong>{meal.meal_type}</strong>
                <small>{meal.meal_name}</small>
              </span>
              <span className="meal-row-kcal">{meal.item_calories}kcal</span>
            </button>
          ))
        )}
      </div>

      <div className="meal-add">
        {/* Always rendered so it can slide in and out; inert while closed so it can't be tabbed to. */}
        <div className={`meal-add-options${isAddOpen ? ' is-open' : ''}`} id="meal-add-options" inert={!isAddOpen}>
            <button className="action-button" type="button" onClick={() => navigate('/log-meals')}>
              <PenLine size={17} aria-hidden="true" /> Manual entry
            </button>
            <button className="action-button" type="button" disabled aria-label="Scan your meal, available with Pro">
              <Camera size={17} aria-hidden="true" /> Scan meal <span className="pro-badge">Pro</span>
            </button>
        </div>
        <button className="primary-button meal-add-button" type="button" aria-expanded={isAddOpen} aria-controls="meal-add-options" onClick={() => setIsAddOpen((open) => !open)}>
          <Plus className="meal-add-icon" size={18} aria-hidden="true" /> Add food
        </button>
      </div>

      {editingMeal && (
        <div className="modal-backdrop" onClick={() => !isSavingEdit && setEditingMeal(null)}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-meal-title">
            <div className="modal-header">
              <div>
                <h2 id="edit-meal-title" className="modal-title">Edit meal</h2>
                <p className="card-subtitle">Update ingredients and portion sizes.</p>
              </div>
              <button type="button" className="btn-modal-close" onClick={() => setEditingMeal(null)} aria-label="Close editor" disabled={isSavingEdit}>
                <X size={20} />
              </button>
            </div>

            <form className="modal-form" onSubmit={confirmEdit}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-meal-type">Meal type</label>
                <select id="edit-meal-type" className="form-input" value={editMealType} onChange={(event) => setEditMealType(event.target.value)}>
                  {['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Meal'].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label" htmlFor="edit-food-name">Add an ingredient</label>
                <div className="input-with-icon">
                  <input
                    id="edit-food-name"
                    className="form-input"
                    value={editFoodName}
                    onChange={(event) => {
                      setEditFoodName(event.target.value);
                      setIsFoodSearchOpen(true);
                      setFoodSuggestions([]);
                      setIsSearchingFoods(false);
                      setEditDensity(DEFAULT_FOOD_DENSITY);
                      setEditError(null);
                    }}
                    placeholder="Search foods..."
                    autoComplete="off"
                  />
                  {isSearchingFoods
                    ? <Loader2 size={16} className="animate-spin input-spinner" aria-label="Searching" />
                    : <Search size={16} className="input-spinner" aria-hidden="true" />}
                </div>
                {isFoodSearchOpen && foodSuggestions.length > 0 && (
                  <ul className="suggestions-list">
                    {foodSuggestions.map((food) => (
                      <li key={food.id}>
                        <button type="button" className="suggestion-item" onClick={() => selectFoodSuggestion(food)}>
                          <span className="suggestion-name">{food.name}</span>
                          <span className="suggestion-cals">{food.calories_per_100g} kcal / 100g</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="inputs-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-food-quantity">Quantity</label>
                  <div className="input-with-suffix">
                    <input
                      id="edit-food-quantity"
                      className="form-input"
                      type="number"
                      min="1"
                      value={editQuantity}
                      onFocus={rememberNewQuantityStart}
                      onChange={(event) => updateNewQuantity(event.target.value)}
                    />
                    <span className="input-suffix"><Scale size={16} aria-hidden="true" /> grams</span>
                  </div>
                </div>
                <button className="btn-add-food" type="button" onClick={addEditIngredient} disabled={!editFoodName.trim() || Number(editQuantity) <= 0}>
                  <Plus size={16} aria-hidden="true" /> Add ingredient
                </button>
              </div>

              <section className="plate-foods" aria-label="Ingredients in this meal">
                <div className="calc-header-row">
                  <span className="calc-label">Ingredients</span>
                  <span className="plate-food-count">{editIngredients.length}</span>
                </div>
                {editIngredients.length === 0 ? (
                  <p className="calc-disclaimer">Add at least one ingredient to save this meal.</p>
                ) : (
                  <ul className="plate-food-list">
                    {editIngredients.map((ingredient, index) => (
                      <li className="plate-food-row" key={`${ingredient.name}-${index}`}>
                        <span>{ingredient.name}</span>
                        <label className="edit-ingredient-quantity">
                          <input
                            aria-label={`${ingredient.name} quantity in grams`}
                            type="number"
                            min="1"
                            value={ingredient.quantity_g || ''}
                            onFocus={() => rememberIngredientQuantityStart(index, ingredient.quantity_g)}
                            onChange={(event) => updateIngredientQuantity(index, event.target.value)}
                          />
                          <small>g</small>
                        </label>
                        <button type="button" onClick={() => setEditIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${ingredient.name}`}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="calculation-preview-card">
                <div className="calc-header-row">
                  <span className="calc-label">Meal total · {Math.round(editNutrition.quantity)}g</span>
                  <span className="calc-cals-badge">{Math.round(editNutrition.calories)} kcal</span>
                </div>
                <div className="calc-macros-grid">
                  <div className="calc-macro-item"><span className="macro-name">Protein</span><span className="macro-num">{editNutrition.protein.toFixed(1)}g</span></div>
                  <div className="calc-macro-item"><span className="macro-name">Carbs</span><span className="macro-num">{editNutrition.carbs.toFixed(1)}g</span></div>
                  <div className="calc-macro-item"><span className="macro-name">Fat</span><span className="macro-num">{editNutrition.fat.toFixed(1)}g</span></div>
                </div>
              </div>

              {editError && <div className="inline-alert" role="alert">{editError}</div>}
              <button className="primary-button" type="submit" disabled={isSavingEdit || editIngredients.length === 0 || editIngredients.some((ingredient) => ingredient.quantity_g <= 0)}>
                {isSavingEdit ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Saving...</> : 'Save changes'}
              </button>
              <button className="text-action meal-delete-link" type="button" disabled={isSavingEdit} onClick={() => { setDeletingMeal(editingMeal); setEditingMeal(null); }}>
                <Trash2 size={16} aria-hidden="true" /> Delete meal
              </button>
            </form>
          </div>
        </div>
      )}

      {highQuantityWarning && (
        <div className="quantity-warning-backdrop">
          <div
            className="quantity-warning-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quantity-warning-title"
            aria-describedby="quantity-warning-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                rollbackHighQuantity();
              }
            }}
          >
            <div className="quantity-warning-icon" aria-hidden="true">
              <AlertTriangle size={24} />
            </div>
            <h3 id="quantity-warning-title">Is {highQuantityWarning.next.toLocaleString()}g correct?</h3>
            <p id="quantity-warning-description">
              <strong>{highQuantityWarning.name}</strong> at {highQuantityWarning.next.toLocaleString()}g is over
              {MAX_REASONABLE_QUANTITY_G.toLocaleString()}g. That may be too much for one meal. Please confirm
              the amount is right.
            </p>
            <div className="quantity-warning-actions">
              <button type="button" className="quantity-warning-rollback" onClick={rollbackHighQuantity} autoFocus>
                Rollback
              </button>
              <button type="button" className="quantity-warning-accept" onClick={acceptHighQuantity}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingMeal && (
        <div className="modal-backdrop">
          <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-meal-title">
            <h2 id="delete-meal-title">Delete {deletingMeal.meal_name}?</h2>
            <p>It will be removed from this day. This cannot be undone.</p>
            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => { setDeletingMeal(null); setDeleteError(null) }} disabled={isDeletingMeal}>Cancel</button>
              <button className="danger-action" type="button" onClick={confirmDelete} disabled={isDeletingMeal}>
                {isDeletingMeal ? 'Deleting...' : 'Delete meal'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
