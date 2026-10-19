import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAdjustments } from './workoutAdjustments.ts'

function workoutSet(set_number, { weight = 60, reps = 8, completed = false } = {}) {
  return { set_number, weight_kg: weight, reps, is_completed: completed }
}

function activeSession(exercises, setKinds = {}) {
  return { name: 'Push day', startedAt: '2026-10-19T10:00:00.000Z', exercises, setKinds }
}

function exercise(exercise_id, sets) {
  return { exercise_id, name: exercise_id, previous_weight_kg: null, previous_reps: null, sets }
}

test('reduce_load rewrites unfinished sets and leaves completed sets alone', () => {
  const session = activeSession([exercise('bench', [
    workoutSet(1, { completed: true }),
    workoutSet(2),
    workoutSet(3),
  ])])

  const result = applyAdjustments(session, {}, {}, [
    { exercise_id: 'bench', action: 'reduce_load', reason: 'RPE 9', new_weight_kg: 50 },
  ])

  assert.deepEqual(result.session.exercises[0].sets.map((set) => set.weight_kg), [60, 50, 50])
  assert.deepEqual(result.session.exercises[0].sets.map((set) => set.is_completed), [true, false, false])
})

test('reduce_reps rewrites only the remaining reps', () => {
  const session = activeSession([exercise('bench', [
    workoutSet(1, { completed: true, reps: 10 }),
    workoutSet(2, { reps: 10 }),
  ])])

  const result = applyAdjustments(session, {}, {}, [
    { exercise_id: 'bench', action: 'reduce_reps', reason: 'RPE 9', new_reps: 6 },
  ])

  assert.deepEqual(result.session.exercises[0].sets.map((set) => set.reps), [10, 6])
})

test('drop_set marks the next unfinished set and keeps existing kinds', () => {
  const session = activeSession(
    [exercise('bench', [workoutSet(1, { completed: true }), workoutSet(2), workoutSet(3)])],
    { '0:1': 'warmup' },
  )

  const result = applyAdjustments(session, {}, {}, [
    { exercise_id: 'bench', action: 'drop_set', reason: 'Finish strong' },
  ])

  assert.deepEqual(result.session.setKinds, { '0:1': 'warmup', '0:2': 'drop' })
})

test('stop_exercise keeps completed sets and renumbers their RPE keys', () => {
  const session = activeSession(
    [exercise('bench', [
      workoutSet(1, { completed: true }),
      workoutSet(2),
      workoutSet(3, { completed: true, reps: 6 }),
    ])],
    { '0:2': 'drop' },
  )
  const rpeValues = { '0:1': 8, '0:2': 9, '0:3': 7 }

  const result = applyAdjustments(session, rpeValues, {}, [
    { exercise_id: 'bench', action: 'stop_exercise', reason: 'Stop here' },
  ])

  assert.deepEqual(result.session.exercises[0].sets, [
    workoutSet(1, { completed: true }),
    workoutSet(2, { completed: true, reps: 6 }),
  ])
  assert.deepEqual(result.session.setKinds, {})
  assert.deepEqual(result.rpeValues, { '0:1': 8, '0:2': 7 })
})

test('stop_exercise removes an exercise with no completed sets and reindexes every map', () => {
  const session = activeSession(
    [
      exercise('bench', [workoutSet(1), workoutSet(2)]),
      exercise('row', [workoutSet(1), workoutSet(2)]),
    ],
    { '1:2': 'drop' },
  )

  const result = applyAdjustments(
    session,
    { '0:1': 9, '1:1': 8, '1:2': 7 },
    { 0: 90, 1: 60 },
    [{ exercise_id: 'bench', action: 'stop_exercise', reason: 'Stop here' }],
  )

  assert.deepEqual(result.session.exercises.map((item) => item.exercise_id), ['row'])
  assert.deepEqual(result.session.setKinds, { '0:2': 'drop' })
  assert.deepEqual(result.rpeValues, { '0:1': 8, '0:2': 7 })
  assert.deepEqual(result.restRemaining, { 0: 60 })
})

test('accept all applies every adjustment in order and ignores unknown exercises', () => {
  const session = activeSession([
    exercise('bench', [workoutSet(1), workoutSet(2)]),
    exercise('row', [workoutSet(1)]),
  ])

  const result = applyAdjustments(session, {}, {}, [
    { exercise_id: 'bench', action: 'reduce_load', reason: 'Fatigue', new_weight_kg: 52.5 },
    { exercise_id: 'row', action: 'drop_set', reason: 'Finish strong' },
    { exercise_id: 'gone', action: 'reduce_reps', reason: 'Stale', new_reps: 4 },
  ])

  assert.deepEqual(result.session.exercises[0].sets.map((set) => set.weight_kg), [52.5, 52.5])
  assert.deepEqual(result.session.setKinds, { '1:1': 'drop' })
})

test('stop_exercise does nothing when every set is already completed', () => {
  const session = activeSession([exercise('bench', [workoutSet(1, { completed: true })])])

  const result = applyAdjustments(session, { '0:1': 8 }, {}, [
    { exercise_id: 'bench', action: 'stop_exercise', reason: 'Stop here' },
  ])

  assert.deepEqual(result.session.exercises[0].sets, [workoutSet(1, { completed: true })])
  assert.deepEqual(result.rpeValues, { '0:1': 8 })
})
