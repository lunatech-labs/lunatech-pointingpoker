import './round-bar.css'
import { Eye, RotateCcw, Trash } from 'lucide-react'
import { useRoundGuard } from './useRoundGuard'

type Props = { revealed: boolean; onShow: () => void; onRevote: () => void; onClear: () => void }

export function RoundBar({ revealed, onShow, onRevote, onClear }: Props) {
  const guarded = useRoundGuard(revealed)
  return (
    <section
      className="panel round-bar"
      aria-label="Round"
      // Drops a press while guarded, and a double-click's second click before the flip.
      onClickCapture={e => {
        if (guarded || e.detail > 1) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
      // A held Enter's repeats are dropped, guarded or not.
      onKeyDownCapture={e => e.repeat && e.key === 'Enter' && e.preventDefault()}
    >
      <div className="round-bar-phase" data-testid="phase-line">
        <h2 className="panel-label">{revealed ? 'Revealed' : 'Voting'}</h2>
      </div>
      <button
        type="button"
        className="button-quiet"
        data-do="clear"
        aria-disabled={guarded || undefined}
        onClick={onClear}
      >
        <Trash />
        Clear votes
      </button>
      {/* One element across the flip, so focus stays on it. */}
      <button
        type="button"
        className="button button-primary"
        aria-disabled={guarded || undefined}
        onClick={revealed ? onRevote : onShow}
      >
        {revealed ? <RotateCcw /> : <Eye />}
        <span className="button-word">{revealed ? 'Re-vote' : 'Show votes'}</span>
      </button>
    </section>
  )
}
