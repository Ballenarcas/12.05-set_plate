import PremiumUpsellButton from '../components/premium/PremiumUpsellButton'

function Nutrition() {
  return (
    <div className="screen">
      <header className="screen-header">
        <div><p className="eyebrow">Fuel your goals</p><h1>Nutrition</h1></div>
        <PremiumUpsellButton />
      </header>
      <div className="placeholder">
        <p className="training-meta">Your meals and macro history will live here.</p>
      </div>
    </div>
  )
}

export default Nutrition
