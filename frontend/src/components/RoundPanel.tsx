import './round-panel.css'
import type { View } from '../room/view'
import { Deck } from './Deck'
import { Result } from './Result'

type Props = { view: View; onVote: (estimation: string) => void }

// The slot holds the voter's deck while voting and the result once revealed.
export function RoundPanel({ view, onVote }: Props) {
  const voter = view.ownRole !== 'Facilitator'
  if (!voter && !view.votesRevealed) return null
  return (
    <section className="panel round-panel">
      <div className="round-panel-slot" data-testid="round-slot">
        {view.votesRevealed ? (
          <Result summary={view.votesSummary} />
        ) : (
          <Deck view={view} onVote={onVote} />
        )}
      </div>
    </section>
  )
}
