import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Dumbbell, Pencil, Sparkles } from 'lucide-react';
import { fetchExerciseMuscleGroups, fetchExercises, getCurrentUser, isPremiumActive, PREMIUM_UPDATED_EVENT } from '../../services/api';
import MediaCredit from '../workout/MediaCredit';
import { useNavigate } from 'react-router-dom';
import type { Exercise } from '../../types';

interface SelectExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  onCreateCustom?: () => void;
  excludedExerciseIds?: string[];
  excludedExerciseNames?: string[];
}

export const SelectExerciseModal: React.FC<SelectExerciseModalProps> = ({
  isOpen,
  onClose,
  onSelectExercise,
  onCreateCustom,
  excludedExerciseIds = [],
  excludedExerciseNames = [],
}) => {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [muscleGroupsLoaded, setMuscleGroupsLoaded] = useState(false);
  const [muscleGroupError, setMuscleGroupError] = useState<string | null>(null);
  const [resolvedExerciseRequest, setResolvedExerciseRequest] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(() => isPremiumActive(getCurrentUser()));

  const exerciseRequestKey = `${searchQuery}|${selectedMuscleGroup}`;
  const loading = isOpen && resolvedExerciseRequest !== exerciseRequestKey;

  useEffect(() => {
    const syncPremium = () => setIsPremium(isPremiumActive(getCurrentUser()));
    syncPremium();
    window.addEventListener(PREMIUM_UPDATED_EVENT, syncPremium);
    window.addEventListener('storage', syncPremium);
    return () => {
      window.removeEventListener(PREMIUM_UPDATED_EVENT, syncPremium);
      window.removeEventListener('storage', syncPremium);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let isCurrent = true;
    fetchExerciseMuscleGroups()
      .then((groups) => {
        if (isCurrent) {
          setMuscleGroups(groups);
          setMuscleGroupError(null);
          setMuscleGroupsLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setMuscleGroupError(error instanceof Error ? error.message : 'Unable to load muscle groups.');
          setMuscleGroupsLoaded(true);
        }
      });
    return () => { isCurrent = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let isCurrent = true;
    fetchExercises({
      q: searchQuery.trim() || undefined,
      muscle_group: selectedMuscleGroup || undefined,
      limit: 30,
      compact: true,
    })
      .then((response) => {
        if (isCurrent) {
          setExercises(response.items);
          setLoadError(null);
          setResolvedExerciseRequest(exerciseRequestKey);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load exercises.');
          setResolvedExerciseRequest(exerciseRequestKey);
        }
      });
    return () => { isCurrent = false; };
  }, [searchQuery, selectedMuscleGroup, isOpen, exerciseRequestKey]);

  if (!isOpen) return null;

  const excludedIds = new Set(excludedExerciseIds);
  const excludedNames = new Set(excludedExerciseNames.map((name) =>
    name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase()))
  const availableExercises = exercises.filter((exercise) =>
    !excludedIds.has(exercise.id) &&
    !excludedNames.has(exercise.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase()))

  const handleCreateCustom = () => {
    const activePremium = isPremiumActive(getCurrentUser());
    onClose();
    if (!activePremium) {
      navigate('/premium');
      return;
    }
    if (onCreateCustom) {
      onCreateCustom();
    } else {
      navigate('/exercises/custom');
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999,
        backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', paddingTop: '15vh', boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative', width: '100%', maxWidth: '360px', backgroundColor: '#1a1a1c',
          borderRadius: '24px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9)', border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '20px 18px 14px 18px', color: '#ffffff', display: 'flex', flexDirection: 'column',
          maxHeight: '65vh', overflow: 'hidden', boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, textAlign: 'center', color: '#f3f3f5' }}>
            SELECT EXERCISE
          </h2>
          <button onClick={onClose} type="button" style={{ position: 'absolute', right: 0, background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exercises..." autoFocus
            style={{ width: '100%', padding: '11px 38px 11px 14px', backgroundColor: '#28282a', border: 'none', borderRadius: '12px', color: '#ffffff', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' }}
          />
          <Search size={17} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#7c7c80', pointerEvents: 'none' }} />
        </div>

        <label style={{ display: 'grid', gap: '6px', marginBottom: '14px', color: '#a1a1a6', fontSize: '12px', fontWeight: 600 }}>
          Muscle group
          <select
            aria-label="Filter exercises by muscle group"
            value={selectedMuscleGroup} onChange={(event) => setSelectedMuscleGroup(event.target.value)}
            style={{ width: '100%', padding: '10px 12px', backgroundColor: '#28282a', border: 'none', borderRadius: '12px', color: '#ffffff', fontSize: '13px', boxSizing: 'border-box' }}
          >
            <option value="">All muscle groups</option>
            {muscleGroups.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          {muscleGroupError && <span role="alert" style={{ color: '#ff9c9c', fontWeight: 400 }}>{muscleGroupError}</span>}
          {!muscleGroupsLoaded && <span role="status" style={{ color: '#8e8e93', fontWeight: 400 }}>Loading muscle groups...</span>}
        </label>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '2px', scrollbarWidth: 'thin', scrollbarColor: '#3a3a3c transparent' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#8e8e93', fontSize: '13px' }}>Loading exercises...</div>
          ) : loadError ? (
            <div role="alert" style={{ textAlign: 'center', padding: '32px 0', color: '#ff9c9c', fontSize: '13px' }}>{loadError}</div>
          ) : availableExercises.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#8e8e93', fontSize: '13px' }}>No exercises found</div>
          ) : (
            availableExercises.map((ex) => (
              <div
                key={ex.id}
                onClick={() => { onSelectExercise(ex); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px', borderRadius: '10px', cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#28282a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                  {ex.images?.[0] ? (
                    <img src={ex.images[0]} alt="" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', backgroundColor: '#28282a', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#28282a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1a6', flexShrink: 0 }}>
                      <Dumbbell size={18} />
                    </div>
                  )}

                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {ex.name}
                      {ex.is_custom && <span style={{ fontSize: '9px', backgroundColor: '#8B5CF6', color: 'white', padding: '2px 5px', borderRadius: '4px', fontWeight: 700 }}>CUSTOM</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8e8e93', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ex.muscle_group || ex.muscles?.[0] || ex.category || 'General'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {ex.is_custom && (
                    <button
                      type="button"
                      aria-label={`Edit ${ex.name}`}
                      onClick={(e) => { e.stopPropagation(); onClose(); navigate(`/exercises/custom/${ex.id}`); }}
                      style={{ background: 'none', border: 'none', color: '#8e8e93', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Add ${ex.name}`}
                    onClick={(e) => { e.stopPropagation(); onSelectExercise(ex); onClose(); }}
                    style={{ background: 'none', border: 'none', color: '#a1a1a6', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <MediaCredit />

        <div style={{ marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          {!isPremium && (
            <span style={{ fontSize: '11px', color: '#a1a1a6', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={12} style={{ color: '#b084e9' }} /> Premium feature
            </span>
          )}
          <button
            onClick={handleCreateCustom}
            type="button"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#b084e9',
              fontSize: '12.5px',
              fontWeight: 600,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {isPremium ? 'Create custom exercise' : 'Create custom exercise (Upgrade)'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SelectExerciseModal;;