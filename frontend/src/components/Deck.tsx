import './deck.css'
import { useId } from 'react'
import type { View } from '../room/view'
import { Figure } from './Figure'

export const estimationValues = [
  '0',
  '0.5',
  '1',
  '2',
  '3',
  '5',
  '8',
  '13',
  '21',
  '34',
  '55',
  '89',
  '?'
]

type Props = { view: View; onVote: (estimation: string) => void }

// Drawn only while voting, so a card is never disabled.
export function Deck({ view, onVote }: Props) {
  const noteId = useId()
  const own = (e: string) => e === view.userEstimation
  const kept = (e: string) => own(e) && !view.ownVoteConfirmed
  return (
    <div className="deck" role="group" aria-label="Estimation cards">
      <span id={noteId} hidden>
        Previous vote, not confirmed
      </span>
      {estimationValues.map(e => (
        <div className="deck-place" key={e}>
          <button
            type="button"
            className={kept(e) ? 'deck-card deck-card-kept' : 'deck-card'}
            aria-pressed={own(e) && view.ownVoteConfirmed}
            aria-describedby={kept(e) ? noteId : undefined}
            onClick={() => onVote(e)}
          >
            <Figure value={e} />
          </button>
          {kept(e) && (
            <span className="deck-tag" aria-hidden="true">
              Not confirmed
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
