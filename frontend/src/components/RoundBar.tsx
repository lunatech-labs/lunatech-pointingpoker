import './round-bar.css'
import { type RefObject, useLayoutEffect, useState } from 'react'
import { ArrowRight, Eye, RotateCcw, Trash } from 'lucide-react'
import { useRoundGuard } from './useRoundGuard'

type Props = {
  revealed: boolean
  onShow: () => void
  onRevote: () => void
  onClear: () => void
  onNext: () => void
  nextRef: RefObject<HTMLButtonElement | null>
  toggleRef: RefObject<HTMLButtonElement | null>
}

export function RoundBar({ revealed, onShow, onRevote, onClear, onNext, nextRef, toggleRef }: Props) {
  const guarded = useRoundGuard(revealed)
  const [nextHeld, setNextHeld] = useState(false)
  const [refocus, setRefocus] = useState(0)
  // Next issue leaving while it holds focus hands focus to the toggle (Next issue spec, decision 5).
  if (!revealed && nextHeld) {
    setNextHeld(false)
    setRefocus(r => r + 1)
  }
  useLayoutEffect(() => {
    if (refocus > 0) toggleRef.current?.focus()
  }, [refocus, toggleRef])
  const heard = revealed ? 'Votes revealed' : 'Voting open'
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
        {/* The word is seen, the sentence heard from its region. */}
        {/* The h2 copies it as its label: Firefox names no heading from a status. */}
        <h2 className="panel-label" aria-label={heard}>
          <span aria-hidden="true" data-testid="phase-word">
            {revealed ? 'Revealed' : 'Voting'}
          </span>
          <span className="visually-hidden" role="status" data-testid="phase-heard">
            {heard}
          </span>
        </h2>
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
        ref={toggleRef}
        type="button"
        className={`button ${revealed ? 'button-secondary' : 'button-primary'}`}
        aria-label={revealed ? 'Re-vote' : 'Show votes'}
        aria-disabled={guarded || undefined}
        onClick={revealed ? onRevote : onShow}
      >
        {revealed ? <RotateCcw /> : <Eye />}
        <span className="button-word">{revealed ? 'Re-vote' : 'Show votes'}</span>
      </button>
      {revealed && (
        <button
          ref={nextRef}
          type="button"
          className="button button-primary"
          aria-label="Next issue"
          data-do="next"
          aria-disabled={guarded || undefined}
          onClick={onNext}
          onFocus={() => setNextHeld(true)}
          onBlur={() => setNextHeld(false)}
        >
          <ArrowRight />
          <span className="button-word">
            Next<span className="round-bar-tail"> issue</span>
          </span>
        </button>
      )}
    </section>
  )
}
