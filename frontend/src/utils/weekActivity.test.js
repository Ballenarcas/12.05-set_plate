import assert from 'node:assert/strict'
import test from 'node:test'
import { lastSevenDays } from './weekActivity.ts'

test('marks the days with a workout in the last 7 days, oldest first', () => {
  const today = new Date(2026, 10, 9, 12)
  const days = lastSevenDays([
    { started_at: new Date(2026, 10, 9, 8).toISOString() },
    { started_at: new Date(2026, 10, 3, 18).toISOString() },
    { started_at: new Date(2026, 10, 2, 18).toISOString() }, // 8 days ago: outside the window
  ], today)
  assert.equal(days.length, 7)
  assert.deepEqual(days.map((day) => day.trained), [true, false, false, false, false, false, true])
  assert.equal(days[6].label, 'Mo')
})
