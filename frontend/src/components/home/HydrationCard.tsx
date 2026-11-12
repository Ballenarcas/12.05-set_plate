import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import {
  addHydrationEntry,
  fetchHydrationToday,
  removeHydrationEntry,
  type HydrationEntry,
  type HydrationToday,
} from '../../services/api'

const GLASS_ML = 250
const UNIT_LIMITS = { ml: 5000, glass: 20 } as const

function formatMl(value: number): string {
  return value.toLocaleString('de-DE')
}

function entryLabel(entry: HydrationEntry): string {
  if (entry.unit === 'glass') {
    const glasses = entry.amount_ml / GLASS_ML
    const count = Number.isInteger(glasses) ? String(glasses) : glasses.toFixed(1)
    return `${count} ${count === '1' ? 'glass' : 'glasses'} · ${formatMl(entry.amount_ml)} ml`
  }
  return `${formatMl(entry.amount_ml)} ml`
}

function entryTime(entry: HydrationEntry): string | null {
  if (!entry.created_at) return null
  const moment = new Date(entry.created_at)
  if (Number.isNaN(moment.getTime())) return null
  return moment.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function HydrationCard() {
  const [data, setData] = useState<HydrationToday | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [unit, setUnit] = useState<'ml' | 'glass'>('ml')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetchHydrationToday()
      .then((next) => mounted && setData(next))
      .catch((error: Error) => mounted && setNotice(error.message))
      .finally(() => mounted && setLoaded(true))
    return () => {
      mounted = false
    }
  }, [])

  async function logDrink(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const value = Math.round(Number(amount.replace(',', '.')))
    const limit = UNIT_LIMITS[unit]
    if (!Number.isFinite(value) || value < 1 || value > limit) {
      const unitLabel = unit === 'ml' ? 'ml' : limit === 1 ? 'glass' : 'glasses'
      setNotice(`Enter an amount between 1 and ${limit} ${unitLabel}.`)
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      setData(await addHydrationEntry({ amount: value, unit }))
      setAmount('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We couldn't save this drink.")
    } finally {
      setBusy(false)
    }
  }

  async function removeEntry(entryId: string) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      setData(await removeHydrationEntry(entryId))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We couldn't remove this drink.")
    } finally {
      setBusy(false)
    }
  }

  const progress = data?.progress_percentage ?? 0

  return (
    <div className="card hydration-card" aria-busy={!loaded}>
      <div className="progress-copy">
        <strong>{data ? `${formatMl(data.total_ml)} / ${formatMl(data.goal_ml)} ml` : '—'}</strong>
        <span>{data ? `${progress}% of daily goal` : loaded ? 'Hydration unavailable' : 'Loading…'}</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Daily hydration progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="progress-value hydration-progress-value" style={{ width: `${progress}%` }} />
      </div>

      <form className="hydration-controls" onSubmit={logDrink}>
        <div className="hydration-unit-toggle" role="group" aria-label="Log water in">
          <button
            type="button"
            aria-pressed={unit === 'ml'}
            onClick={() => { setUnit('ml'); setNotice(null) }}
          >
            Milliliters
          </button>
          <button
            type="button"
            aria-pressed={unit === 'glass'}
            onClick={() => { setUnit('glass'); setNotice(null) }}
          >
            Glasses (250 ml)
          </button>
        </div>
        <div className="hydration-amount-row">
          <input
            className="hydration-amount-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={UNIT_LIMITS[unit]}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={unit === 'ml' ? 'e.g. 500' : 'e.g. 2'}
            aria-label={unit === 'ml' ? 'Amount in milliliters' : 'Number of glasses'}
          />
          <button className="action-button hydration-add" type="submit" disabled={busy || !amount.trim()}>
            <Plus size={17} aria-hidden="true" /> Add
          </button>
        </div>
      </form>

      {notice && <p className="form-error hydration-notice" role="alert">{notice}</p>}

      {loaded && data && (data.entries.length === 0 ? (
        <p className="hydration-empty">No drinks logged yet today.</p>
      ) : (
        <ul className="hydration-entries" aria-label="Drinks logged today">
          {data.entries.map((entry) => (
            <li className="hydration-entry" key={entry.id}>
              <span className="hydration-entry-meta">
                <span className="hydration-entry-amount">{entryLabel(entry)}</span>
                {entryTime(entry) && <span className="hydration-entry-time">{entryTime(entry)}</span>}
              </span>
              <button
                type="button"
                className="hydration-entry-remove"
                onClick={() => removeEntry(entry.id)}
                disabled={busy}
                aria-label={`Remove ${entryLabel(entry)}`}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}
