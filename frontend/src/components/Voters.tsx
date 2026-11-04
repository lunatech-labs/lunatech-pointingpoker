import './voters.css'
import { type ParticipantRow, type View, voteState } from '../room/view'
import { Figure } from './Figure'
import { useFitEntries } from './useFitEntries'

const markName = { none: 'No vote', confirmed: 'Voted', kept: 'Previous vote, not confirmed' }

// The phone's line names two facilitators, then the rest as a count.
const named = (names: string[]) =>
  names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', ')

function Face({ voter, revealed }: { voter: ParticipantRow; revealed: boolean }) {
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
      {state === 'kept' && <span role="img" aria-label={markName.kept} />}
    </span>
  )
}

// The table: voters only, as cards, their scale fitted to it (decision 4).
export function Voters({ view }: { view: View }) {
  const voters = view.users.filter(u => !u.facilitator)
  const facilitators = view.users.filter(u => u.facilitator).map(u => u.name)
  const reserve = view.ownRole === 'Facilitator' && !view.votesRevealed
  const { box, list } = useFitEntries({
    reserve,
    revealed: view.votesRevealed,
    names: voters.map(u => u.name)
  })
  return (
    <section
      ref={box}
      className={reserve ? 'panel voters voters-reserve' : 'panel voters'}
      role="region"
      aria-label="Voters"
      tabIndex={0}
    >
      <div className="voters-top">
        <h2 className="panel-label">Voters · {voters.length}</h2>
      </div>
      <ul ref={list} className="voters-entries">
        {voters.map(u => (
          <li key={u.id} data-testid="participant">
            <Face voter={u} revealed={view.votesRevealed} />
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
        ))}
      </ul>
      {facilitators.length > 0 && (
        <p className="voters-facilitators">Facilitators: {named(facilitators)}</p>
      )}
    </section>
  )
}
