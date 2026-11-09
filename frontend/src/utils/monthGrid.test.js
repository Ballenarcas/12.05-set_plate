import assert from 'node:assert/strict'
import test from 'node:test'
import { monthWeeks, sameDay } from './monthGrid.ts'

test('November 2026 starts on Monday 26 Oct and ends on Sunday 6 Dec', () => {
  const weeks = monthWeeks(2026, 10)
  assert.equal(weeks.length, 6)
  assert.ok(weeks.every((week) => week.length === 7))
  assert.ok(sameDay(weeks[0][0], new Date(2026, 9, 26)))
  assert.ok(sameDay(weeks.at(-1).at(-1), new Date(2026, 11, 6)))
})

test('a month that starts on Monday has no leading days', () => {
  const weeks = monthWeeks(2026, 5) // June 2026 starts on Monday
  assert.ok(sameDay(weeks[0][0], new Date(2026, 5, 1)))
  assert.ok(sameDay(weeks.at(-1).at(-1), new Date(2026, 6, 5)))
})
