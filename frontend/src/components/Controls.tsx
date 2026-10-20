import { useRoundGuard } from './useRoundGuard'

type Props = { revealed: boolean; onShow: () => void; onRevote: () => void; onClear: () => void }

export function Controls({ revealed, onShow, onRevote, onClear }: Props) {
  const guarded = useRoundGuard(revealed)
  return (
    <div className="row mt-4">
      <div className="col">
        <div
          className="d-flex flex-row align-items-start"
          // Drops a press while guarded, and a double-click's second click before the flip.
          onClickCapture={e => {
            if (guarded || e.detail > 1) {
              e.stopPropagation()
              e.preventDefault()
            }
          }}
          // A held Enter repeats its click the same way.
          onKeyDownCapture={e => e.repeat && e.key === 'Enter' && e.preventDefault()}
        >
          <div className="mr-auto">
            <button
              type="button"
              className={revealed ? 'btn revote-bt' : 'btn show-bt'}
              aria-disabled={guarded || undefined}
              onClick={revealed ? onRevote : onShow}
            >
              {revealed ? 'Re-vote' : 'Show votes'}
            </button>
          </div>
          <div className="ml-auto">
            <button
              type="button"
              className="btn clear-bt"
              aria-disabled={guarded || undefined}
              onClick={onClear}
            >
              Clear votes
            </button>
          </div>
        </div>
      </div>
      <div className="col"></div>
    </div>
  )
}
