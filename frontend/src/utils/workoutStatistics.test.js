import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_STATISTICS_RANGE,
  STATISTICS_RANGES,
  formatChartDate,
  formatPercentage,
  formatStatisticsDuration,
  formatVolumeKg,
  formatWorkoutCount,
} from './workoutStatistics.ts'

test('statistics range defaults to one month and exposes 1W, 1M and 3M', () => {
  assert.equal(DEFAULT_STATISTICS_RANGE, '1M')
  assert.deepEqual(STATISTICS_RANGES.map((range) => range.value), ['1W', '1M', '3M'])
})

test('volume uses readable kilogram formatting', () => {
  assert.equal(formatVolumeKg(0), '0')
  assert.equal(formatVolumeKg(1234), '1,234')
  assert.equal(formatVolumeKg(1234.56), '1,234.6')
  assert.equal(formatVolumeKg(Number.NaN), '0')
  assert.equal(formatVolumeKg(-10), '0')
})

test('workout counts are formatted as whole numbers', () => {
  assert.equal(formatWorkoutCount(0), '0')
  assert.equal(formatWorkoutCount(1234), '1,234')
  assert.equal(formatWorkoutCount(Number.NaN), '0')
})

test('duration is formatted in human-readable hours and minutes', () => {
  assert.equal(formatStatisticsDuration(0), '0 min')
  assert.equal(formatStatisticsDuration(30), '<1 min')
  assert.equal(formatStatisticsDuration(3599), '59 min')
  assert.equal(formatStatisticsDuration(20100), '5 h 35 min')
  assert.equal(formatStatisticsDuration(3600), '1 h')
  assert.equal(formatStatisticsDuration(-1), 'Unavailable')
  assert.equal(formatStatisticsDuration(Number.NaN), 'Unavailable')
})

test('chart dates avoid UTC shifts and label weekly buckets clearly', () => {
  assert.equal(formatChartDate('2026-10-25', 'day'), 'Oct 25')
  assert.equal(formatChartDate('2026-10-19', 'week'), 'Week of Oct 19')
})

test('percentages are calculated from classified volume safely', () => {
  assert.equal(formatPercentage(50, 200), '25%')
  assert.equal(formatPercentage(200, 200), '100%')
  assert.equal(formatPercentage(0, 0), '0%')
  assert.equal(formatPercentage(10, 0), '0%')
})
