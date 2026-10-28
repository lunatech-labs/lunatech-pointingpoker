import './issue-editor.css'
import type { RefObject } from 'react'
import { Check, X } from 'lucide-react'

type Props = {
  text: string
  editing: boolean
  boxRef: RefObject<HTMLInputElement | null>
  onType: (text: string) => void
  onSubmit: () => void
  onCancel: () => void
}

// The editing view, legacy until 4c1-editor; IssuePanel holds its state and press rules.
export function IssueEditor({ text, editing, boxRef, onType, onSubmit, onCancel }: Props) {
  return (
    <div className="legacy-page">
      <div className="input-group">
        <input
          ref={boxRef}
          type="text"
          placeholder="Current issue"
          aria-label="Current issue"
          className="form-control"
          value={text}
          readOnly={!editing}
          onChange={e => onType(e.target.value)}
          onKeyDown={e => {
            // A capture preventDefault does not stop this handler, so it drops repeats itself.
            if (e.repeat) return
            // Enter also confirms an input method's composition, which is not a save.
            // Safari ends it first, so that Enter has isComposing false and keyCode 229.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') onSubmit()
            else if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="input-group-append">
          <button
            className={`btn btn-outline-secondary${editing ? '' : ' disabled'}`}
            type="button"
            aria-label="Save issue"
            aria-disabled={!editing || undefined}
            onClick={onSubmit}
          >
            <Check size={20} />
          </button>
          <button
            className={`btn btn-outline-secondary${editing ? '' : ' disabled'}`}
            type="button"
            aria-label="Cancel editing"
            aria-disabled={!editing || undefined}
            onClick={onCancel}
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
