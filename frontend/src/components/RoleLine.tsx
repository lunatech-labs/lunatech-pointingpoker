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
          onClick={() => onSwitch(facilitator ? 'Voter' : 'Facilitator')}
        >
          {facilitator ? 'Switch to voter' : 'Switch to facilitator'}
        </button>
      </div>
    </div>
  )
}
