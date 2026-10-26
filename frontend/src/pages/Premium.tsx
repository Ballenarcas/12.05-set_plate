import { BookOpen, Camera, Check, Crown, Dumbbell, Loader2, TrendingUp, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  getCurrentUser,
  isPremiumActive,
  purchasePremium,
  type PremiumStatus,
} from '../services/api'
import type { PremiumPlan } from '../types'
import '../styles/premium.css'

interface PremiumFeature {
  title: string
  description: string
  Icon: LucideIcon
  tone: 'violet' | 'pink' | 'amber' | 'green'
}

const FEATURES: PremiumFeature[] = [
  {
    title: 'AI Program Creation',
    description: 'Build full workout plans based on your goals and equipment.',
    Icon: Dumbbell,
    tone: 'violet',
  },
  {
    title: 'AI Photo Meal Logging',
    description: 'Identify meals and ingredients from photos, fast and accurate.',
    Icon: Camera,
    tone: 'pink',
  },
  {
    title: 'AI Meal Recommendations',
    description: 'Discover personalized meal ideas with full nutritional data.',
    Icon: BookOpen,
    tone: 'amber',
  },
  {
    title: 'Advanced Workout Statistics',
    description: 'Dive deep into progression over time with specific data points.',
    Icon: TrendingUp,
    tone: 'green',
  },
]

function formatEndDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function planLabel(plan: string | null | undefined): string {
  return plan === 'monthly' ? 'Monthly' : 'Annual'
}

interface PremiumConfirmationProps {
  plan: string | null | undefined
  expiresAt: string | null | undefined
  isNew: boolean
  onContinue: () => void
}

function PremiumConfirmation({ plan, expiresAt, isNew, onContinue }: PremiumConfirmationProps) {
  const formattedExpiry = formatEndDate(expiresAt)
  return (
    <div className="premium-success">
      <div className="premium-success-icon"><Check size={30} strokeWidth={3} aria-hidden="true" /></div>
      <p className="eyebrow">{isNew ? 'Premium unlocked' : 'Your membership'}</p>
      <h1>{isNew ? "You're all set." : 'Premium is active.'}</h1>
      <p>
        Your <strong>{planLabel(plan)}</strong> membership is active
        {formattedExpiry ? <> until <strong>{formattedExpiry}</strong></> : null}. All premium tools are
        now unlocked.
      </p>
      <button className="premium-cta" type="button" onClick={onContinue}>Start training</button>
    </div>
  )
}

function Premium() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const user = getCurrentUser()
  const alreadyPremium = isPremiumActive(user)

  const [purchasing, setPurchasing] = useState<PremiumPlan | null>(null)
  const [purchase, setPurchase] = useState<PremiumStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const goBack = () => {
    navigate(from && from !== '/premium' ? from : '/', { replace: true })
  }

  const buy = async (plan: PremiumPlan) => {
    if (purchasing) return
    setError(null)
    setNotice(null)
    setPurchasing(plan)
    try {
      setPurchase(await purchasePremium(plan))
    } catch (purchaseError) {
      const timedOut = purchaseError instanceof Error
        && (purchaseError.name === 'TimeoutError' || purchaseError.name === 'AbortError')
      setError(
        timedOut
          ? 'The purchase timed out. Please check your connection and try again.'
          : purchaseError instanceof Error
            ? purchaseError.message
            : 'Could not activate premium',
      )
    } finally {
      setPurchasing(null)
    }
  }

  if (purchase || alreadyPremium) {
    return (
      <div className="premium-screen">
        <div className="premium-glow" aria-hidden="true" />
        <button className="premium-close" type="button" onClick={goBack} aria-label="Close premium screen">
          <X size={19} aria-hidden="true" />
        </button>
        <PremiumConfirmation
          plan={purchase?.plan ?? user?.premium_plan}
          expiresAt={purchase?.expires_at ?? user?.premium_expires_at}
          isNew={purchase !== null}
          onContinue={goBack}
        />
      </div>
    )
  }

  return (
    <div className="premium-screen">
      <div className="premium-glow" aria-hidden="true" />
      <button className="premium-close" type="button" onClick={goBack} aria-label="Close premium screen">
        <X size={19} aria-hidden="true" />
      </button>

      <header className="premium-heading">
        <p className="premium-kicker"><Crown size={13} aria-hidden="true" /> SET&PLATE PREMIUM</p>
        <h1>Unlock your<br />maximum potential</h1>
        <p className="premium-mock-note">Mock checkout — no payment is processed.</p>
      </header>

      <ul className="premium-features" aria-label="Premium features">
        {FEATURES.map(({ title, description, Icon, tone }) => (
          <li className="premium-feature" key={title}>
            <span className={`premium-feature-icon tone-${tone}`} aria-hidden="true"><Icon size={21} /></span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="premium-plans" role="group" aria-label="Choose a premium plan">
        <article className="premium-plan is-featured">
          <span className="premium-plan-badge">Best value · most popular</span>
          <h2>Annual</h2>
          <p className="premium-price"><span>€79.99</span><small>/year</small></p>
          <p className="premium-price-note">That's €6.67/month, billed yearly</p>
          <button
            className="premium-cta"
            type="button"
            onClick={() => buy('annual')}
            disabled={purchasing !== null}
          >
            {purchasing === 'annual'
              ? <><Loader2 className="premium-spinner" size={15} aria-hidden="true" /> Activating…</>
              : 'Start your free trial'}
          </button>
        </article>

        <article className="premium-plan">
          <h2>Monthly</h2>
          <p className="premium-price"><span>€9.99</span><small>/month</small></p>
          <p className="premium-price-note">Billed monthly · cancel anytime</p>
          <button
            className="premium-cta is-secondary"
            type="button"
            onClick={() => buy('monthly')}
            disabled={purchasing !== null}
          >
            {purchasing === 'monthly'
              ? <><Loader2 className="premium-spinner" size={15} aria-hidden="true" /> Activating…</>
              : 'Subscribe now'}
          </button>
        </article>
      </div>

      <p className="premium-trial-note">
        <Check size={13} aria-hidden="true" /> Includes 7 days free trial on annual plans
      </p>

      {error && <p className="premium-error" role="alert">{error}</p>}
      {notice && <p className="premium-notice" role="status">{notice}</p>}

      <nav className="premium-links" aria-label="Premium information">
        <button
          type="button"
          onClick={() => setNotice('This is a mock checkout — legal pages are not connected.')}
        >
          Terms of Service
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => setNotice('This is a mock checkout — legal pages are not connected.')}
        >
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => setNotice(
            isPremiumActive()
              ? 'Premium is already active on this account.'
              : 'No previous purchase found. This is a mock checkout.',
          )}
        >
          Restore Purchases
        </button>
      </nav>

      <button className="premium-skip" type="button" onClick={goBack}>Continue with Limited Version</button>
    </div>
  )
}

export default Premium
