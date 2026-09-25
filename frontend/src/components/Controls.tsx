type Props = { revealed: boolean; onShow: () => void; onRevote: () => void; onClear: () => void }

export function Controls({ revealed, onShow, onRevote, onClear }: Props) {
  return (
    <div className="row mt-4">
      <div className="col">
        <div className="d-flex flex-row align-items-start">
          <div className="mr-auto">
            <button type="button" className="btn show-bt" onClick={onShow}>
              Show votes
            </button>
          </div>
          {revealed && (
            <div className="mx-2">
              <button type="button" className="btn revote-bt" onClick={onRevote}>
                Re-vote
              </button>
            </div>
          )}
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
