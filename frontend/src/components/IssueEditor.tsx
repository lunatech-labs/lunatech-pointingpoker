import './issue-editor.css'
import type { RefObject } from 'react'
import { Check, X } from 'lucide-react'

type Props = {
  text: string
  editing: boolean
  boxRef: RefObject<HTMLTextAreaElement | null>
  onType: (text: string) => void
  onSubmit: () => void
  onCancel: () => void
}

// The editing view; IssuePanel holds its state and press rules.
export function IssueEditor({ text, editing, boxRef, onType, onSubmit, onCancel }: Props) {
  return (
    <div className="issue-editor">
      <textarea
        ref={boxRef}
        rows={1}
        enterKeyHint="done"
        aria-label="Current issue"
        className="issue-editor-field"
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
      <div className="issue-editor-actions">
        <button
          className="button button-primary"
          type="button"
          aria-label="Save issue"
          aria-disabled={!editing || undefined}
          onClick={onSubmit}
        >
          <Check />
          <span className="button-word">Save</span>
        </button>
        <button
          className="button button-secondary"
          type="button"
          aria-label="Cancel editing"
          aria-disabled={!editing || undefined}
          onClick={onCancel}
        >
          <X />
          <span className="button-word">Cancel</span>
        </button>
      </div>
    </div>
  )
}
