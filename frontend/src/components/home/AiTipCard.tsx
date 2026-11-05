import { CircleHelp, Lightbulb } from 'lucide-react'
import { useEffect, useState } from 'react'
import { decideTip, fetchCurrentTip, undoTip, type AiTip } from '../../services/api'
import { useDialogBehavior } from '../../utils/useDialogBehavior'

const ENCOURAGEMENT = 'Keep it up! Every meal and workout you log helps me give you better tips.'
const UNDO_WINDOW_MS = 8000

export default function AiTipCard({ onApplied }: { onApplied: () => void }) {
  const [tip, setTip] = useState<AiTip | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [undoTipId, setUndoTipId] = useState<string | null>(null)
  const [showWhy, setShowWhy] = useState(false)
  const dialogRef = useDialogBehavior(showWhy, () => setShowWhy(false))

  useEffect(() => {
    let mounted = true
    fetchCurrentTip()
      .then((next) => mounted && setTip(next))
      .catch(() => undefined) // The dashboard stays usable and shows the encouragement message.
      .finally(() => mounted && setLoaded(true))
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!undoTipId) return
    const timer = window.setTimeout(() => {
      setUndoTipId(null)
      setNotice(null)
    }, UNDO_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [undoTipId])

  async function decide(status: 'accepted' | 'dismissed') {
    if (!tip || busy) return
    setBusy(true)
    setNotice(null)
    setUndoTipId(null)
    try {
      const result = await decideTip(tip.id, status)
      setTip(result.tip)
      setNotice(result.confirmation ?? result.notice)
      if (status === 'accepted' && result.applied) {
        setUndoTipId(tip.id)
        onApplied()
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We couldn't update this tip.")
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!undoTipId || busy) return
    setBusy(true)
    try {
      const result = await undoTip(undoTipId)
      setTip(result.tip)
      setNotice(result.notice)
      setUndoTipId(null)
      if (result.applied) onApplied()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We couldn't undo that change.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card ai-banner ai-tip" aria-live="polite" aria-busy={!loaded}>
        <Lightbulb size={21} aria-hidden="true" />
        <div className="ai-tip-body">
          <p className="ai-tip-message" key={tip?.id ?? (loaded ? 'done' : 'loading')}>{tip ? tip.message : loaded ? ENCOURAGEMENT : 'Thinking about your day…'}</p>
          {notice && (
            <div className="ai-tip-notice" role="status">
              <p>{notice}</p>
              {undoTipId && <button type="button" className="ai-tip-btn" disabled={busy} onClick={undo}>Undo</button>}
            </div>
          )}
          {tip && (
            <div className="ai-tip-actions">
              <button type="button" className="ai-tip-btn ai-tip-accept" disabled={busy} onClick={() => decide('accepted')}>Accept</button>
              <button type="button" className="ai-tip-btn" disabled={busy} onClick={() => decide('dismissed')}>Dismiss</button>
              <button type="button" className="ai-tip-btn ai-tip-why" aria-label="Why this tip?" onClick={() => setShowWhy(true)}>
                <CircleHelp size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {showWhy && tip && (
        <div className="ai-tip-backdrop" onClick={() => setShowWhy(false)}>
          <div
            className="ai-tip-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-tip-why-title"
            tabIndex={-1}
            ref={dialogRef}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="ai-tip-why-title">Why this tip?</h3>
            <p>{tip.reasoning}</p>
            <button type="button" className="primary-button" onClick={() => setShowWhy(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
