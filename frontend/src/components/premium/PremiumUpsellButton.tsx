import { Crown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PREMIUM_UPDATED_EVENT, isPremiumActive } from '../../services/api'

interface PremiumUpsellButtonProps {
  compact?: boolean
  className?: string
}

function PremiumUpsellButton({ compact = false, className = '' }: PremiumUpsellButtonProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isPremium, setIsPremium] = useState(() => isPremiumActive())

  useEffect(() => {
    const syncPremiumState = () => setIsPremium(isPremiumActive())
    window.addEventListener(PREMIUM_UPDATED_EVENT, syncPremiumState)
    window.addEventListener('storage', syncPremiumState)
    return () => {
      window.removeEventListener(PREMIUM_UPDATED_EVENT, syncPremiumState)
      window.removeEventListener('storage', syncPremiumState)
    }
  }, [])

  if (isPremium) return null

  return (
    <button
      type="button"
      className={`premium-upsell-button${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => navigate('/premium', { state: { from: location.pathname } })}
      aria-label="Unlock SET&PLATE Premium"
      title="Unlock Premium"
    >
      <Crown size={15} aria-hidden="true" />
      {compact ? null : <span>Go Premium</span>}
    </button>
  )
}

export default PremiumUpsellButton
