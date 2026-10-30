type Props = {
  error: string
  moved: boolean
  onDismissMoved: () => void
  restarted: boolean
  onDismissRestarted: () => void
}

export function Alerts(props: Props) {
  const { error, moved, onDismissMoved, restarted, onDismissRestarted } = props
  return (
    <div className="legacy-page">
      {error && (
        <div className="alert alert-danger m-1" role="alert">
          {error}
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
      {restarted && (
        <div className="alert alert-info m-1" role="status">
          Reconnected. Please check your vote.
          <button
            type="button"
            className="close"
            aria-label="Dismiss"
            onClick={onDismissRestarted}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}
    </div>
  )
}
