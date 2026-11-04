import './roster.css'
import type { CSSProperties, ReactNode } from 'react'
import { avatarPair, initials } from '../room/avatar'
import { type ParticipantRow, type View, voteState } from '../room/view'
import { Figure } from './Figure'

const pill = { none: 'Choosing…', confirmed: 'Voted', kept: 'Not confirmed' }

type RowProps = { name: string; me?: boolean; facilitator?: boolean; children: ReactNode }

// A row never carries the participant test id: the table's entries are the contract's.
function Row({ name, me = false, facilitator = false, children }: RowProps) {
  const pair = avatarPair(name)
  const colours = { '--h': `var(--avatar-ink-${pair})`, '--t': `var(--avatar-ground-${pair})` }
  return (
    <li className={me ? 'roster-row roster-row-me' : 'roster-row'}>
      <span className="roster-avatar" style={colours as CSSProperties} aria-hidden="true">
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

function VoterEnd({ voter, revealed }: { voter: ParticipantRow; revealed: boolean }) {
  const state = voteState(voter)
  if (!revealed) return <span className={`roster-pill roster-pill-${state}`}>{pill[state]}</span>
  if (!voter.estimation) return <span className="roster-value roster-value-none">–</span>
  return (
    <span className="roster-value">
      {state === 'kept' && <small>not confirmed</small>}
      <Figure value={voter.estimation} />
    </span>
  )
}

// Everyone in the room: the voters, then the facilitators below a separator.
export function Roster({ view }: { view: View }) {
  const voters = view.users.filter(u => !u.facilitator)
  const facilitators = view.users.filter(u => u.facilitator)
  return (
    <aside className="panel roster" aria-label="Participants" tabIndex={0}>
      <h2 className="panel-label">Participants · {view.users.length}</h2>
      <ul>
        {voters.map(u => (
          <Row key={u.id} name={u.name} me={u.self}>
            <VoterEnd voter={u} revealed={view.votesRevealed} />
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
