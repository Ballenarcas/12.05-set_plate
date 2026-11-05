import {
  connectHealthConnect as connectApi,
  disconnectHealthConnect as disconnectApi,
  fetchHealthConnectStatus,
  syncHealthConnectActivity,
} from './api'
import type {
  HealthActivityDay,
  HealthConnectSource,
  HealthConnectStatus,
} from '../types/health'

const PREVIEW_DAYS = 7

type NativeActivityDay = {
  date?: string
  steps?: number
  active_calories?: number
  activeCalories?: number
}

type NativeHealthConnect = {
  requestPermissions?: () => Promise<{ granted?: boolean } | boolean>
  readActivity?: (days: number) => Promise<NativeActivityDay[]>
  revokePermissions?: () => Promise<void>
}

declare global {
  interface Window {
    SETPLATEHealthConnect?: NativeHealthConnect
  }
}

function bridge(): NativeHealthConnect | null {
  if (typeof window === 'undefined') return null
  return window.SETPLATEHealthConnect?.readActivity ? window.SETPLATEHealthConnect : null
}

export function isNativeHealthConnectAvailable(): boolean {
  return bridge() !== null
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function normalizeDays(raw: NativeActivityDay[], days: number): HealthActivityDay[] {
  const byDate = new Map<string, HealthActivityDay>()
  for (const item of raw) {
    const key = typeof item.date === 'string' ? item.date.slice(0, 10) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    byDate.set(key, {
      date: key,
      steps: Math.max(0, Math.round(Number(item.steps) || 0)),
      active_calories: Math.max(0, Math.round(Number(item.active_calories ?? item.activeCalories) || 0)),
    })
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-days)
}

function previewDays(userId: string, days: number): HealthActivityDay[] {
  const today = new Date()
  const minutes = today.getHours() * 60 + today.getMinutes()
  const dayFraction = Math.max(0.35, minutes / 1440)
  const result: HealthActivityDay[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    const key = localDateKey(date)
    const seed = hash(`${userId}:${key}`)
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const fullSteps = 5200 + (seed % 4300) + (weekend ? 1600 : 0)
    const steps = Math.round(offset === 0 ? fullSteps * dayFraction : fullSteps)
    result.push({
      date: key,
      steps,
      active_calories: Math.round(steps * 0.034 + (seed % 120)),
    })
  }
  return result
}

async function readNativeActivity(days: number): Promise<HealthActivityDay[]> {
  const native = bridge()
  if (!native?.readActivity) {
    throw new Error('Health Connect is not available on this device.')
  }
  if (native.requestPermissions) {
    const permission = await native.requestPermissions()
    const granted = typeof permission === 'boolean' ? permission : permission?.granted
    if (!granted) throw new Error('Health Connect access was not granted.')
  }
  return normalizeDays(await native.readActivity(days), days)
}

async function activityFor(userId: string, days: number): Promise<{ source: HealthConnectSource; days: HealthActivityDay[] }> {
  if (bridge()) {
    return { source: 'health_connect', days: await readNativeActivity(days) }
  }
  return { source: 'preview', days: previewDays(userId, days) }
}

export async function connectHealthConnect(userId: string): Promise<HealthConnectStatus> {
  const { source, days } = await activityFor(userId, PREVIEW_DAYS)
  return connectApi(source, days)
}

export async function syncHealthConnect(userId: string): Promise<HealthConnectStatus> {
  const status = await fetchHealthConnectStatus()
  if (!status.connected) throw new Error('Connect Health Connect before syncing.')
  if (status.source === 'health_connect' && !bridge()) {
    throw new Error('Real Health Connect data can only sync from the Android app.')
  }
  const { source, days } = await activityFor(userId, PREVIEW_DAYS)
  return syncHealthConnectActivity(source, days)
}

export async function disconnectHealthConnect(): Promise<HealthConnectStatus> {
  const native = bridge()
  if (native?.revokePermissions) {
    try {
      await native.revokePermissions()
    } catch {
      // The server record is the source of truth; a native revoke failure must not block it.
    }
  }
  return disconnectApi()
}

const FRESH_WINDOW_MS = 2 * 60 * 60 * 1000

function syncedRecently(value: string | null): boolean {
  if (!value) return false
  const synced = new Date(value)
  if (Number.isNaN(synced.getTime())) return false
  return Date.now() - synced.getTime() < FRESH_WINDOW_MS
}

let freshRequest: Promise<HealthConnectStatus> | null = null

export async function ensureHealthConnectFresh(
  userId: string,
  knownStatus?: HealthConnectStatus,
): Promise<HealthConnectStatus> {
  if (freshRequest) return freshRequest
  freshRequest = (async () => {
    const status = knownStatus ?? await fetchHealthConnectStatus()
    if (!status.connected) return status
    if (status.source === 'health_connect' && !bridge()) return status
    if (syncedRecently(status.last_sync_at)) return status
    try {
      return await syncHealthConnect(userId)
    } catch {
      return status
    }
  })().finally(() => {
    freshRequest = null
  })
  return freshRequest
}
