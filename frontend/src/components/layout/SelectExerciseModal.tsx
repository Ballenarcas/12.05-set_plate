import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Dumbbell } from 'lucide-react';
import { fetchExerciseMuscleGroups, fetchExercises } from '../../services/api';
import MediaCredit from '../workout/MediaCredit';
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
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [muscleGroupsLoaded, setMuscleGroupsLoaded] = useState(false);
  const [muscleGroupError, setMuscleGroupError] = useState<string | null>(null);
  const [resolvedExerciseRequest, setResolvedExerciseRequest] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const exerciseRequestKey = `${searchQuery}|${selectedMuscleGroup}`;
  const loading = isOpen && resolvedExerciseRequest !== exerciseRequestKey;

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

    return () => {
      isCurrent = false;
    };
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

    return () => {
      isCurrent = false;
    };
  }, [searchQuery, selectedMuscleGroup, isOpen, exerciseRequestKey]);

  if (!isOpen) return null;

  const excludedIds = new Set(excludedExerciseIds);
  const excludedNames = new Set(excludedExerciseNames.map((name) =>
    name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase()))
  const availableExercises = exercises.filter((exercise) =>
    !excludedIds.has(exercise.id) &&
    !excludedNames.has(exercise.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase()))

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',      
        justifyContent: 'center',  
        padding: '16px',           
        paddingTop: '15vh',        // POUSSE LA MODALE VERS LE BAS
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '360px',
          backgroundColor: 'var(--surface)',
          borderRadius: '16px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
          border: '1px solid var(--line)',
          padding: '20px 18px 14px 18px',
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '65vh',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, textAlign: 'center', color: 'var(--text)' }}>
            Select exercise
          </h2>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close"
            style={{
              position: 'absolute',
              right: 0,
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '13px', margin: '-13px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Barre de recherche */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exercises..."
            autoFocus
            style={{
              width: '100%',
              padding: '11px 38px 11px 14px',
              backgroundColor: 'var(--surface-raised)',
              border: 'none',
              borderRadius: '12px',
              color: 'var(--text)',
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <Search size={17} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        </div>

        <label style={{ display: 'grid', gap: '6px', marginBottom: '14px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>
          Muscle group
          <select
            aria-label="Filter exercises by muscle group"
            value={selectedMuscleGroup}
            onChange={(event) => setSelectedMuscleGroup(event.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--surface-raised)',
              border: 'none',
              borderRadius: '12px',
              color: 'var(--text)',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
          >
            <option value="">All muscle groups</option>
            {muscleGroups.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          {muscleGroupError && <span role="alert" style={{ color: 'var(--negative)', fontWeight: 400 }}>{muscleGroupError}</span>}
          {!muscleGroupsLoaded && <span className="visually-hidden" role="status">Loading muscle groups...</span>}
        </label>

        {/* Liste des exercices */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            paddingRight: '2px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--control) transparent',
          }}
        >
          {loading ? (
            <p className="visually-hidden" role="status">Loading exercises...</p>
          ) : loadError ? (
            <div role="alert" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--negative)', fontSize: '13px' }}>{loadError}</div>
          ) : availableExercises.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No exercises found</div>
          ) : (
            availableExercises.map((ex) => (
              <div
                key={ex.id}
                onClick={() => {
                  onSelectExercise(ex);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 8px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-raised)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                  {ex.images?.[0] ? (
                    <img
                      src={ex.images[0]}
                      alt=""
                      style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', backgroundColor: 'var(--surface-raised)', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                      <Dumbbell size={18} />
                    </div>
                  )}

                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ex.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ex.muscles?.[0] || ex.category || 'General'}
                    </div>
                  </div>
                </div>
                <Plus size={16} style={{ color: 'var(--text-faint)', flexShrink: 0, marginLeft: '8px' }} />
              </div>
            ))
          )}
        </div>

        <MediaCredit />

        {/* Pied de page */}
        {onCreateCustom && <div style={{ marginTop: '10px', paddingTop: '10px', textAlign: 'right', borderTop: '1px solid var(--line)' }}>
          <button
            onClick={onCreateCustom}
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              fontSize: '12.5px',
              fontWeight: 500,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Create Custom
          </button>
        </div>}
      </div>
    </div>,
    document.body,
  );
};

export default SelectExerciseModal;
