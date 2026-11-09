import assert from 'node:assert/strict'
import test from 'node:test'
import { lastLifts } from './lastLifts.ts'

const set = (set_number, weight_kg, reps, is_completed = true) => ({ set_number, weight_kg, reps, is_completed })

test('uses the newest workout and its last completed weighted set', () => {
  const lifts = lastLifts([
    { started_at: '2026-11-01T10:00:00Z', exercises: [{ exercise_id: 'bench', sets: [set(1, 70, 8)] }, { exercise_id: 'row', sets: [set(1, 55, 10)] }] },
    { started_at: '2026-11-06T10:00:00Z', exercises: [{ exercise_id: 'bench', sets: [set(1, 80, 8), set(2, 82.5, 6), set(3, 85, 5, false)] }] },
  ])
  assert.deepEqual(lifts.get('bench'), { weight_kg: 82.5, reps: 6 })
  assert.deepEqual(lifts.get('row'), { weight_kg: 55, reps: 10 })
})

test('skips bodyweight and unfinished sets', () => {
  const lifts = lastLifts([
    { started_at: '2026-11-06T10:00:00Z', exercises: [{ exercise_id: 'pullup', sets: [set(1, 0, 10)] }, { exercise_id: 'squat', sets: [set(1, 100, 5, false)] }] },
    { started_at: '2026-11-02T10:00:00Z', exercises: [{ exercise_id: 'squat', sets: [set(1, 95, 5)] }] },
  ])
  assert.equal(lifts.has('pullup'), false)
  assert.deepEqual(lifts.get('squat'), { weight_kg: 95, reps: 5 })
})
