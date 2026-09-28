type Props = { error: string; copied: boolean; moved: boolean; onDismissMoved: () => void }

export function Alerts({ error, copied, moved, onDismissMoved }: Props) {
  return (
    <div className="row">
      <div className="col-md-8 offset-md-2">
        {error && (
          <div className="alert alert-danger m-1" role="alert">
            {error}
          </div>
        )}
        {copied && (
          <div className="alert alert-info m-1" role="alert">
            Link copied to clipboard
          </div>
        )}
        {moved && (
          <div className="alert alert-warning m-1" role="status">
            The old link you followed now opens this address. Please update your invitation or
            bookmark to use it.
            <button type="button" className="close" aria-label="Dismiss" onClick={onDismissMoved}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
