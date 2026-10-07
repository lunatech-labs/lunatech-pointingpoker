import type { Role } from '../protocol/snapshot'

type Props = { role: Role; onSwitch: (role: Role) => void }

// One button whose label changes, so keyboard focus survives the switch.
export function RoleLine({ role, onSwitch }: Props) {
  const facilitator = role === 'Facilitator'
  return (
    <div className="row mb-3">
      <div className="col">
        {facilitator ? 'You are a facilitator.' : 'You are a voter.'}{' '}
        <button
          type="button"
          className="btn btn-link p-0 align-baseline"
          // A double-click's second click would switch back once the first switch re-renders.
          onClick={e => e.detail <= 1 && onSwitch(facilitator ? 'Voter' : 'Facilitator')}
          // A held Enter repeats its click the same way.
          onKeyDown={e => e.repeat && e.key === 'Enter' && e.preventDefault()}
        >
          {facilitator ? 'Switch to voter' : 'Switch to facilitator'}
        </button>
      </div>
    </div>
  )
}
