import './voters.css'
import { type ParticipantRow, type View, voteState } from '../room/view'
import { progress } from '../room/progress'
import { resultExtremes } from '../room/result'
import { estimationValues } from './Deck'
import { Figure } from './Figure'
import { useFitEntries } from './useFitEntries'

const markName = { none: 'No vote', confirmed: 'Voted', kept: 'Previous vote, not confirmed' }
const word = { low: 'lowest', high: 'highest' }

type End = 'low' | 'high' | null

// The phone's line names two facilitators, then the rest as a count.
const named = (names: string[]) =>
  names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', ')

function Face({ voter, revealed, end }: { voter: ParticipantRow; revealed: boolean; end: End }) {
  const state = voteState(voter)
  if (!revealed)
    return (
      <span className={`voters-mark voters-mark-${state}`} role="img" aria-label={markName[state]} />
    )
  if (!voter.estimation)
    return (
      <span className="voters-face voters-face-none">
        <span data-testid="participant-estimation" />
        <span role="img" aria-label="No vote">
          –
        </span>
      </span>
    )
  return (
    <span className={`voters-face voters-face-${state}`}>
      <span data-testid="participant-estimation">
        <Figure value={voter.estimation} />
      </span>
      {end && <span className="visually-hidden">{`, ${word[end]}`}</span>}
      {state === 'kept' && <span role="img" aria-label={markName.kept} />}
    </span>
  )
}

// The table: voters only, as cards, their scale fitted to it (decision 4).
export function Voters({ view }: { view: View }) {
  const voters = view.users.filter(u => !u.facilitator)
  const counted = view.ownRole === 'Voter' && !view.votesRevealed ? progress(voters) : null
  const facilitators = view.users.filter(u => u.facilitator).map(u => u.name)
  const { box, list } = useFitEntries({
    revealed: view.votesRevealed,
    names: voters.map(u => u.name)
  })
  const extremes = view.votesRevealed ? resultExtremes(estimationValues, view.votesSummary) : null
  const end = (estimation: string): End =>
    estimation === extremes?.low ? 'low' : estimation === extremes?.high ? 'high' : null
  return (
    <section
      ref={box}
      className="panel voters"
      role="region"
      aria-label="Voters"
      tabIndex={0}
    >
      <div className="voters-top">
        <h2 className="panel-label">
          {counted
            ? `Voters · ${counted.voted} of ${counted.total} voted`
            : `Voters · ${voters.length}`}
        </h2>
      </div>
      <ul ref={list} className="voters-entries">
        {voters.map(u => {
          const at = end(u.estimation)
          return (
            <li key={u.id} data-testid="participant" className={at ? `voters-${at}` : undefined}>
              <Face voter={u} revealed={view.votesRevealed} end={at} />
              <span className="voters-name">
                {u.self ? (
                  <>
                    <b>{u.name}</b> <span className="voters-you">(you)</span>
                  </>
                ) : (
                  u.name
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {facilitators.length > 0 && (
        <p className="voters-facilitators">Facilitators: {named(facilitators)}</p>
      )}
    </section>
  )
}
