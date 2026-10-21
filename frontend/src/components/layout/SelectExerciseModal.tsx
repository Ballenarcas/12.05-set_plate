import React, { useState, useEffect } from 'react';
import { X, Search, ChevronRight, Dumbbell } from 'lucide-react';
import { fetchExercises } from '../../services/api';
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
  const [resolvedSearchQuery, setResolvedSearchQuery] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loading = isOpen && resolvedSearchQuery !== searchQuery;

  useEffect(() => {
    if (!isOpen) return;

    let isCurrent = true;

    fetchExercises({ q: searchQuery.trim() || undefined, limit: 30, compact: true })
      .then((response) => {
        if (isCurrent) {
          setExercises(response.items);
          setLoadError(null);
          setResolvedSearchQuery(searchQuery);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load exercises.');
          setResolvedSearchQuery(searchQuery);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [searchQuery, isOpen]);

  if (!isOpen) return null;

  const excludedIds = new Set(excludedExerciseIds);
  const excludedNames = new Set(excludedExerciseNames.map((name) =>
    name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase()))
  const availableExercises = exercises.filter((exercise) =>
    !excludedIds.has(exercise.id) &&
    !excludedNames.has(exercise.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase()))

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',      
        justifyContent: 'center',  
        padding: '24px',           
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
          backgroundColor: '#1a1a1c',
          borderRadius: '24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '20px 18px 14px 18px',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '65vh',       
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, textAlign: 'center', color: '#f3f3f5' }}>
            SELECT EXERCISE
          </h2>
          <button
            onClick={onClose}
            type="button"
            style={{
              position: 'absolute',
              right: 0,
              background: 'none',
              border: 'none',
              color: '#8e8e93',
              cursor: 'pointer',
              padding: '4px',
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
              backgroundColor: '#28282a',
              border: 'none',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '13.5px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <Search size={17} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#7c7c80', pointerEvents: 'none' }} />
        </div>

        {/* Liste des exercices */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingRight: '2px',
            scrollbarWidth: 'thin',
            scrollbarColor: '#3a3a3c transparent',
          }}
        >
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
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#28282a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                  {ex.images?.[0] ? (
                    <img
                      src={ex.images[0]}
                      alt=""
                      style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', backgroundColor: '#28282a', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#28282a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1a6', flexShrink: 0 }}>
                      <Dumbbell size={18} />
                    </div>
                  )}

                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ex.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8e8e93', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ex.muscles?.[0] || ex.category || 'General'}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: '#545458', flexShrink: 0, marginLeft: '8px' }} />
              </div>
            ))
          )}
        </div>

        {/* Pied de page */}
        {onCreateCustom && <div style={{ marginTop: '10px', paddingTop: '10px', textAlign: 'right', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <button
            onClick={onCreateCustom}
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: '#b084e9',
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
    </div>
  );
};

export default SelectExerciseModal;