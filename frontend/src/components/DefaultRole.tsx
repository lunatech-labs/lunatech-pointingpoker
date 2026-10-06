import { useId, useRef } from 'react'
import { flushSync } from 'react-dom'
import type { Role } from '../protocol/snapshot'
import { roles } from '../room/joinRole'

type Props = {
  role: Role
  // The fieldset rather than the line: a first visit, or after Change.
  choosing: boolean
  disabled: boolean
  onChoose: (role: Role) => void
  onChange: () => void
}

export function DefaultRole({ role, choosing, disabled, onChoose, onChange }: Props) {
  const group = useId()
  const fieldset = useRef<HTMLFieldSetElement>(null)
  // Change unmounts its own button, so focus moves to the radio the fieldset opens on.
  const reopen = () => {
    flushSync(onChange)
    fieldset.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
  }
  if (!choosing)
    return (
      <div className="form-group row">
        <div className="col-sm-9 offset-sm-3 text-left">
          <span>{`Default role for new rooms: ${role}`}</span>{' '}
          <button
            type="button"
            className="btn btn-link p-0 align-baseline"
            disabled={disabled}
            onClick={reopen}
          >
            Change
          </button>
        </div>
      </div>
    )
  // The legend names the group only as the fieldset's first child, so no row div wraps it.
  return (
    <fieldset ref={fieldset} className="form-group row">
      <legend className="col-form-label col-sm-3 pt-0">Your default role</legend>
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
        <small className="form-text text-muted">
          Used to join new rooms. You can change it here later.
        </small>
      </div>
    </fieldset>
  )
}
