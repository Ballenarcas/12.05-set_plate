import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, MoreHorizontal, Utensils, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchTodayNutrition, getCurrentUser } from '../services/api';
import type { MealLogItem } from '../services/api';

export default function Nutrition() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [allMeals, setAllMeals] = useState<MealLogItem[]>([]);
  const [displayedMeals, setDisplayedMeals] = useState<MealLogItem[]>([]);
  const [dateError, setDateError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // États pour l'édition et la suppression
  const [editingMeal, setEditingMeal] = useState<MealLogItem | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>('');
  const [deletingMeal, setDeletingMeal] = useState<MealLogItem | null>(null);

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
        const mealsList = data.meals || [];
        setAllMeals(mealsList);
      })
      .catch(error => {
        console.error("Erreur de chargement des repas:", error);
        setAllMeals([]);
      })
      .catch(error => {
        console.error("Erreur de chargement des repas:", error);
        setMeals([]);
      })
      .finally(() => setIsLoading(false));
  }, [selectedDate]); // L'ajout de selectedDate ici est la clé du fonctionnement !

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
    setEditQuantity(meal.weight_g || '0');
  };

  const confirmEdit = () => {
    if (!editingMeal) return;
    const ratio = Number(editQuantity) / (Number(editingMeal.weight_g) || 1);
    const updatedMeals = meals.map(m => {
      if (m.id === editingMeal.id) {
        return {
          ...m,
          weight_g: editQuantity,
          item_calories: Math.round(m.item_calories * ratio),
          proteins_g: m.proteins_g ? Math.round(m.proteins_g * ratio) : undefined,
          carbs_g: m.carbs_g ? Math.round(m.carbs_g * ratio) : undefined,
          fats_g: m.fats_g ? Math.round(m.fats_g * ratio) : undefined,
        };
      }
      return m;
    });
    setMeals(updatedMeals);
    setEditingMeal(null);
  };

  const confirmDelete = () => {
    if (!deletingMeal) return;
    const updatedMeals = meals.filter(m => m.id !== deletingMeal.id);
    setMeals(updatedMeals);
    setDeletingMeal(null);
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e93', fontSize: '14px' }}>Loading your meals...</div>
        ) : displayedMeals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e93', fontSize: '14px' }}>No meals recorded for this day.</div>
        ) : (
          displayedMeals.map((meal) => (
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
                  <button onClick={() => openEditModal(meal)} style={{ background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <MoreHorizontal size={20} strokeWidth={2.5} />
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
            </div>
          ))
        )}
      </div>

      {editingMeal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <style>{`.hide-arrows::-webkit-outer-spin-button, .hide-arrows::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } .hide-arrows { -moz-appearance: textfield; }`}</style>
          
          <div style={{ backgroundColor: '#1c1c1e', padding: '24px', borderRadius: '24px', width: '90%', maxWidth: '340px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>Edit Quantity</h3>
            <p style={{ margin: 0, color: '#8e8e93', fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editingMeal.meal_name}</p>
            
            <div style={{ marginTop: '20px', position: 'relative' }}>
              <input type="number" className="hide-arrows" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} style={{ width: '100%', padding: '14px 40px 14px 16px', backgroundColor: '#28282a', border: '1px solid transparent', borderRadius: '12px', color: '#ffffff', fontSize: '16px', boxSizing: 'border-box', outline: 'none' }} placeholder="Quantity" autoFocus />
              <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8e8e93', fontSize: '15px' }}>g</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setEditingMeal(null)} style={{ background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', padding: '10px 16px', fontSize: '14.5px', fontWeight: 600 }}>Cancel</button>
              <button onClick={confirmEdit} style={{ backgroundColor: '#b084e9', border: 'none', color: '#ffffff', borderRadius: '12px', padding: '10px 24px', cursor: 'pointer', fontSize: '14.5px', fontWeight: 600 }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {deletingMeal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#1c1c1e', padding: '24px', borderRadius: '24px', width: '90%', maxWidth: '340px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>Delete Meal?</h3>
            <p style={{ margin: 0, color: '#d1d1d6', fontSize: '14px', lineHeight: '1.5' }}>Are you sure you want to remove <strong style={{color: '#fff'}}>{deletingMeal.meal_name}</strong> from this day? This cannot be undone.</p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setDeletingMeal(null)} style={{ background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', padding: '10px 16px', fontSize: '14.5px', fontWeight: 600 }}>Cancel</button>
              <button onClick={confirmDelete} style={{ backgroundColor: '#ff4d4d', border: 'none', color: '#ffffff', borderRadius: '12px', padding: '10px 24px', cursor: 'pointer', fontSize: '14.5px', fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};