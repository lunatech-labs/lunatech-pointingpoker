import { useId } from 'react'
import type { Role } from '../protocol/snapshot'
import { roles } from '../room/joinRole'

type Props = {
  role: Role
  disabled: boolean
  onChoose: (role: Role) => void
}

export function DefaultRole({ role, disabled, onChoose }: Props) {
  const group = useId()
  // The legend names the group only as the fieldset's first child, so no row div wraps it.
  // Floated, the fieldset no longer draws it on its border, so it takes its column.
  return (
    <fieldset className="form-group row" aria-describedby={`${group}-help`}>
      <legend className="col-form-label col-sm-3 pt-0 float-left">Your default role</legend>
      <div className="col-sm-9 text-left">
        {roles.map(r => (
          <div className="form-check form-check-inline" key={r}>
            <input
              className="form-check-input"
              type="radio"
              name={group}
              id={`${group}-${r}`}
              checked={role === r}
              disabled={disabled}
              onChange={() => onChoose(r)}
            />
            <label className="form-check-label" htmlFor={`${group}-${r}`}>
              {r}
            </label>
          </div>
        ))}
        <small id={`${group}-help`} className="form-text text-muted">
          Used for rooms you have not joined before. In a room you have joined
          before, you keep your previous role there.
        </small>
      </div>
    </fieldset>
  )
}
