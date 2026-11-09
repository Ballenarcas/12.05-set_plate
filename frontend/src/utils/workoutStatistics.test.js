import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatAxisVolume,
  volumeAxisTicks,
  formatCompactDuration,
  formatCompactVolumeKg,
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

test('stat tiles use short values that fit on a phone', () => {
  assert.equal(formatCompactVolumeKg(950), '950 kg')
  assert.equal(formatCompactVolumeKg(9_840), '9.8k kg')
  assert.equal(formatCompactVolumeKg(79_097.5), '79.1k kg')
  assert.equal(formatCompactVolumeKg(1_000), '1k kg')
  assert.equal(formatCompactDuration(45 * 60), '45m')
  assert.equal(formatCompactDuration(2 * 3600), '2h')
  assert.equal(formatCompactDuration(10 * 3600 + 11 * 60), '10h11m')
  assert.equal(formatCompactDuration(2 * 3600 + 5 * 60), '2h05m')
})

test('the volume axis shows a few round, short values', () => {
  assert.deepEqual(volumeAxisTicks(13_000), [0, 5_000, 10_000, 15_000])
  assert.deepEqual(volumeAxisTicks(4_650), [0, 2_000, 4_000, 6_000])
  assert.deepEqual(volumeAxisTicks(9_450), [0, 5_000, 10_000])
  assert.deepEqual(volumeAxisTicks(300), [0, 100, 200, 300])
  assert.ok(volumeAxisTicks(0).length >= 2)
  assert.deepEqual([0, 2_500, 10_000, 500].map(formatAxisVolume), ['0', '2.5k', '10k', '500'])
})
