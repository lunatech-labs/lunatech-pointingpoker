import { Lock } from 'lucide-react'
import type { View } from '../room/view'

const estimationValues = ['0', '0.5', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?']

type Props = { view: View; onVote: (estimation: string) => void }

export function Deck({ view, onVote }: Props) {
  const cardClass = (e: string) => {
    if (e !== view.userEstimation) return 'btn estimation-button m-1'
    return view.ownVoteConfirmed
      ? 'btn estimation-button estimation-button-selected m-1'
      : 'btn estimation-button estimation-button-uncomfirmed m-1'
  }
  return (
    <div className="row">
      <div className="col">
        <div className="lt-dark-red-bg estimation-card">
          <div className="row">
            <div className="col mt-2">
              <h6>Your estimation</h6>
            </div>
          </div>
          <div className="row">
            <div className="col mt-2">
              <div className="estimation-text">{view.userEstimation}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="col">
        <div className="row">
          {estimationValues.map(e => (
            <div className="col" key={e}>
              <button
                type="button"
                className={cardClass(e)}
                disabled={view.votesRevealed}
                onClick={() => onVote(e)}
              >
                {e}
              </button>
            </div>
          ))}
        </div>
        {/* Hidden rather than absent: its row sizes the estimation card, so removing it
            resizes the card and shifts every row below on each reveal. */}
        <div className="row" style={{ visibility: view.votesRevealed ? 'visible' : 'hidden' }}>
          <div className="col text-muted m-1">
            <Lock size={20} />
            <small>The round is revealed. Press Re-vote to open it again.</small>
          </div>
        </div>
      </div>
    </div>
  )
}
