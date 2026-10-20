type Props = { revealed: boolean; onShow: () => void; onRevote: () => void; onClear: () => void }

export function Controls({ revealed, onShow, onRevote, onClear }: Props) {
  return (
    <div className="row mt-4">
      <div className="col">
        <div
          className="d-flex flex-row align-items-start"
          // A double-click's second click would repeat the command before the flip re-renders.
          onClickCapture={e => {
            if (e.detail > 1) {
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
              onClick={revealed ? onRevote : onShow}
            >
              {revealed ? 'Re-vote' : 'Show votes'}
            </button>
          </div>
          <div className="ml-auto">
            <button type="button" className="btn clear-bt" onClick={onClear}>
              Clear votes
            </button>
          </div>
        </div>
      </div>
      <div className="col"></div>
    </div>
  )
}
