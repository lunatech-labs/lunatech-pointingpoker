import './round-panel.css'
import type { View } from '../room/view'
import { Deck } from './Deck'
import { Progress } from './Progress'
import { Result } from './Result'

type Props = { view: View; onVote: (estimation: string) => void }

// The slot holds the result once revealed; while voting, the voter's deck or the facilitator's progress.
export function RoundPanel({ view, onVote }: Props) {
  const voter = view.ownRole !== 'Facilitator'
  return (
    <section className="panel round-panel">
      <div className="round-panel-slot" data-testid="round-slot">
        {view.votesRevealed ? (
          <Result summary={view.votesSummary} />
        ) : voter ? (
          <Deck view={view} onVote={onVote} />
        ) : (
          <Progress voters={view.users.filter(u => !u.facilitator)} />
        )}
      </div>
    </section>
  )
}
