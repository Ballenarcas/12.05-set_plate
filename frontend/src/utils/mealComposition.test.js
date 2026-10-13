import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeMeal } from './mealComposition.js'

test('sums portions and nutrition for multiple foods into one meal', () => {
  const result = summarizeMeal([
    { calories: 165, protein: 31, carbs: 0, fat: 3.6, quantityGrams: 100 },
    { calories: 260, protein: 5.4, carbs: 56, fat: 0.6, quantityGrams: 200 },
  ])

  assert.deepEqual(result, {
    calories: 425,
    protein: 36.4,
    carbs: 56,
    fat: 4.2,
    quantityGrams: 300,
  })
})

test('returns zero totals for an empty meal', () => {
  assert.deepEqual(summarizeMeal([]), {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    quantityGrams: 0,
  })
})
