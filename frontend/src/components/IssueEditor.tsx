import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'

type Props = {
  issue: string
  onIssue: (issue: string) => void
  onFocusChange: (focused: boolean) => void
  onCommit: () => void
}

export function IssueEditor({ issue, onIssue, onFocusChange, onCommit }: Props) {
  const [editing, setEditing] = useState(false)
  const commit = () => {
    setEditing(false)
    // Removing the focused input fires no blur, so release the guard here or it sticks.
    onFocusChange(false)
    onCommit()
  }
  return (
    <div className="form-group row">
      <div className="col">
        {editing ? (
          <div className="input-group">
            <input
              type="text"
              placeholder="Current issue"
              className="form-control"
              value={issue}
              onChange={e => onIssue(e.target.value)}
              onFocus={() => onFocusChange(true)}
              onBlur={() => onFocusChange(false)}
            />
            <div className="input-group-append" onClick={commit}>
              <button className="btn btn-outline-secondary" type="button">
                <Check size={20} />
              </button>
            </div>
          </div>
        ) : (
          <div className="input-group">
            <input
              type="text"
              placeholder="Current issue"
              className="form-control"
              value={issue}
              readOnly
            />
            <div className="input-group-append" onClick={() => setEditing(true)}>
              <button className="btn btn-outline-secondary" type="button">
                <Pencil size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
