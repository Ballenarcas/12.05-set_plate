import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, ArrowLeft, Calendar, Camera, Loader2, Pencil, Plus, Scale, Search, Utensils, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deleteMealLog, fetchTodayNutrition, getCurrentUser, searchFoodItems, updateMealLog } from '../services/api';
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

export default function Nutrition() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [meals, setMeals] = useState<MealLogItem[]>([]);
  const [dateError, setDateError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
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

    setIsLoading(true);

    // Formatage sûr de la date locale en YYYY-MM-DD (évite les bugs de fuseau horaire)
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    // On utilise ta nouvelle fonction API qui gère les dates
    fetchTodayNutrition(user.id, formattedDate)
      .then(data => {
        setMeals(data.meals || []);
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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    const today = new Date();
    const diffTime = today.getTime() - newDate.getTime(); 
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 7 || diffDays < 0) {
      setDateError("You can't select a date outside the 1-week limit.");
    } else {
      setDateError(null);
      setSelectedDate(newDate); // Ceci va déclencher le useEffect juste au-dessus
    }
  };

  const formatDateLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateString = date.toLocaleDateString('en-US', options).toUpperCase();

    if (date.toDateString() === today.toDateString()) return `TODAY, ${dateString}`;
    if (date.toDateString() === yesterday.toDateString()) return `YESTERDAY, ${dateString}`;
    return dateString;
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return 'Just now';
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return timeString;
    }
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
    <div style={{ backgroundColor: '#121212', minHeight: '100vh', color: '#f3f3f5', padding: '24px 20px', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: '120px' }}>
      
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#f3f3f5', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={24} strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.05em', margin: 0, textTransform: 'uppercase' }}>SAVED MEAL HISTORY</h1>
        
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Calendar size={24} style={{ color: '#8e8e93' }} strokeWidth={2} />
          <input 
            type="date" 
            max={new Date().toISOString().split('T')[0]}
            onChange={handleDateChange}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', colorScheme: 'dark' }}
            aria-label="Select date"
          />
        </div>
      </header>

      {dateError && (
        <div style={{ backgroundColor: 'rgba(255, 77, 77, 0.1)', border: '1px solid rgba(255, 77, 77, 0.2)', color: '#ff4d4d', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center', fontSize: '13.5px', fontWeight: 500 }}>
          {dateError}
        </div>
      )}

      <h2 style={{ color: '#8e8e93', fontSize: '12.5px', marginBottom: '16px', fontWeight: 500, letterSpacing: '0.02em' }}>
        {formatDateLabel(selectedDate)}
      </h2>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => navigate('/log-meals')}
          style={{ flex: 1, minWidth: 0, minHeight: '58px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px solid #333', borderRadius: '14px', color: '#f3f3f5', backgroundColor: '#1c1c1e', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}
        >
          <Plus size={20} aria-hidden="true" />
          Manual Register
        </button>
        <button
          type="button"
          disabled
          aria-label="Scan plate, available with Pro"
          style={{ flex: 1, minWidth: 0, minHeight: '58px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', border: '1px solid #292929', borderRadius: '14px', color: '#969696', backgroundColor: '#191919', cursor: 'not-allowed', fontSize: '14px', fontWeight: 700, opacity: 0.8 }}
        >
          <Camera size={18} aria-hidden="true" />
          <span>Scan plate</span>
          <span style={{ padding: '3px 7px', borderRadius: '6px', color: '#161616', backgroundColor: '#b99a45', fontSize: '10px', fontWeight: 800 }}>PRO</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e93', fontSize: '14px' }}>Loading your meals...</div>
        ) : meals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e93', fontSize: '14px' }}>No meals recorded for this day.</div>
        ) : (
          meals.map((meal) => (
            <div key={meal.id} style={{ backgroundColor: '#1c1c1e', borderRadius: '20px', padding: '20px', position: 'relative', border: '1px solid rgba(255,255,255,0.03)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flex: 1, paddingRight: '12px' }}>
                  <Utensils size={18} color="#8e8e93" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, lineHeight: '1.3', letterSpacing: '0.02em', color: '#ffffff' }}>
                    {meal.meal_type.toUpperCase()}: {meal.meal_name.toUpperCase()}
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#8e8e93', fontSize: '13.5px', fontWeight: 500 }}>
                    {formatTime(meal.consumed_at)}
                  </span>
                  <button onClick={() => openEditModal(meal)} aria-label={`Edit ${meal.meal_name}`} style={{ background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <Pencil size={18} strokeWidth={2} />
                  </button>
                  <button onClick={() => setDeletingMeal(meal)} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <Trash2 size={18} strokeWidth={2} />
                  </button>
                </div>
              </div>

              <ul style={{ listStyleType: 'disc', paddingLeft: '28px', margin: 0, color: '#d1d1d6', fontSize: '14px', lineHeight: '1.8' }}>
                <li>{meal.item_calories} kcal</li>
                {meal.proteins_g !== undefined && <li>{meal.proteins_g}g Protein</li>}
                {meal.carbs_g !== undefined && <li>{meal.carbs_g}g Carbs</li>}
                {meal.fats_g !== undefined && <li>{meal.fats_g}g Fat</li>}
              </ul>
              {meal.ingredient_details_saved === false && (
                <p style={{ margin: '10px 0 0', color: '#d6b85a', fontSize: '12px', lineHeight: 1.4 }}>
                  Saved without ingredient details. Apply the meal ingredients database migration to enable ingredient editing.
                </p>
              )}
            </div>
          ))
        )}
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
              <button className="btn-modal-submit" type="submit" disabled={isSavingEdit || editIngredients.length === 0 || editIngredients.some((ingredient) => ingredient.quantity_g <= 0)}>
                {isSavingEdit ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Saving...</> : 'Save changes'}
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#1c1c1e', padding: '24px', borderRadius: '24px', width: '90%', maxWidth: '340px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>Delete Meal?</h3>
            <p style={{ margin: 0, color: '#d1d1d6', fontSize: '14px', lineHeight: '1.5' }}>Are you sure you want to remove <strong style={{color: '#fff'}}>{deletingMeal.meal_name}</strong> from this day? This cannot be undone.</p>
            {deleteError && <p role="alert" style={{ margin: '12px 0 0', color: '#ff8585', fontSize: '13px' }}>{deleteError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => { setDeletingMeal(null); setDeleteError(null) }} disabled={isDeletingMeal} style={{ background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', padding: '10px 16px', fontSize: '14.5px', fontWeight: 600 }}>Cancel</button>
              <button onClick={confirmDelete} disabled={isDeletingMeal} style={{ backgroundColor: '#ff4d4d', border: 'none', color: '#ffffff', borderRadius: '12px', padding: '10px 24px', cursor: isDeletingMeal ? 'wait' : 'pointer', fontSize: '14.5px', fontWeight: 600 }}>
                {isDeletingMeal ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};