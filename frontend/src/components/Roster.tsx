import './roster.css'
import type { CSSProperties, ReactNode } from 'react'
import { avatarPair, initials } from '../room/avatar'
import { resultExtremes } from '../room/result'
import { type ParticipantRow, type View, voteState } from '../room/view'
import { estimationValues } from './Deck'
import { Figure } from './Figure'

const pill = { none: 'No vote', confirmed: 'Voted', kept: 'Not confirmed' }
const word = { low: 'lowest', high: 'highest' }

type End = 'low' | 'high' | null

type RowProps = { name: string; me?: boolean; facilitator?: boolean; children: ReactNode }

// A row never carries the participant test id: the table's entries are the contract's.
function Row({ name, me = false, facilitator = false, children }: RowProps) {
  const pair = avatarPair(name)
  const colours = { '--h': `var(--avatar-ink-${pair})`, '--t': `var(--avatar-ground-${pair})` }
  return (
    <li className={me ? 'roster-row roster-row-me' : 'roster-row'}>
      <span
        className="roster-avatar"
        data-testid="avatar"
        style={colours as CSSProperties}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <span className="roster-who" title={name}>
        <span data-testid={facilitator ? 'facilitator' : undefined}>{name}</span>
        {me && <small>(you)</small>}
      </span>
      {children}
    </li>
  )
}

function VoterEnd({ voter, revealed, end }: { voter: ParticipantRow; revealed: boolean; end: End }) {
  const state = voteState(voter)
  if (!revealed) return <span className={`roster-pill roster-pill-${state}`}>{pill[state]}</span>
  if (!voter.estimation) return <span className="roster-value roster-value-none">–</span>
  return (
    <span className="roster-value">
      {state === 'kept' && <small>not confirmed</small>}
      <span className={end ? `roster-value-figure roster-value-${end}` : 'roster-value-figure'}>
        <Figure value={voter.estimation} />
      </span>
      {end && <span className="visually-hidden">{`, ${word[end]}`}</span>}
    </span>
  )
}

// Everyone in the room: the voters, then the facilitators below a separator.
export function Roster({ view }: { view: View }) {
  const voters = view.users.filter(u => !u.facilitator)
  const facilitators = view.users.filter(u => u.facilitator)
  const extremes = view.votesRevealed ? resultExtremes(estimationValues, view.votesSummary) : null
  const end = (estimation: string): End =>
    estimation === extremes?.low ? 'low' : estimation === extremes?.high ? 'high' : null
  return (
    <aside className="panel roster" aria-label="Participants" tabIndex={0}>
      <h2 className="panel-label">Participants · {view.users.length}</h2>
      <ul>
        {voters.map(u => (
          <Row key={u.id} name={u.name} me={u.self}>
            <VoterEnd voter={u} revealed={view.votesRevealed} end={end(u.estimation)} />
          </Row>
        ))}
      </ul>
      {facilitators.length > 0 && (
        <>
          <hr className="roster-separator" />
          <ul>
            {facilitators.map(u => (
              <Row key={u.id} name={u.name} facilitator>
                <span className="roster-facilitator">Facilitator</span>
              </Row>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
