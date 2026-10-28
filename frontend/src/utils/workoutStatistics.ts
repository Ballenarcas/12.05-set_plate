import type { WorkoutStatisticsRange } from '../types/workout'

export interface StatisticsRangeOption {
  value: WorkoutStatisticsRange
  label: string
  description: string
}

export const STATISTICS_RANGES: StatisticsRangeOption[] = [
  { value: '1W', label: '1W', description: 'Last 7 days' },
  { value: '1M', label: '1M', description: 'Last month' },
  { value: '3M', label: '3M', description: 'Last 3 months' },
]

export const DEFAULT_STATISTICS_RANGE: WorkoutStatisticsRange = '1M'

// en-US matches the copy in the UI (periods for grouping, commas for decimals);
// fr-FR here would render "1 234" and break the expectations in the tests.
const volumeFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const countFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Format workout numbers with periods for grouping and commas for decimals. */
export function formatVolumeKg(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  return volumeFormatter.format(value)
}

export function formatWorkoutCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  return countFormatter.format(Math.floor(value))
}

/** Format recorded seconds as a human-readable duration, e.g. "5 h 35 min". */
export function formatStatisticsDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unavailable'
  const totalMinutes = Math.floor(seconds / 60)
  if (totalMinutes === 0) return seconds > 0 ? '<1 min' : '0 min'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

function parseCalendarDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

/** Format a YYYY-MM-DD bucket for chart axes without applying a UTC shift. */
export function formatChartDate(value: string, granularity: 'day' | 'week'): string {
  const date = parseCalendarDate(value)
  if (!date) return value
  const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
  return granularity === 'week' ? `Week of ${formatted}` : formatted
}

export function formatStatisticsDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return ''
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`
}

export function formatPercentage(part: number, total: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || part <= 0 || total <= 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}
