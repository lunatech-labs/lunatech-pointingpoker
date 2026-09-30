import { useRef } from 'react'
import { Check, Pen, X } from 'lucide-react'
import { useIssueEditor } from './useIssueEditor'

type Props = {
  issue: string
  onSave: (issue: string) => Promise<void>
}

export function IssueEditor({ issue, onSave }: Props) {
  const editor = useIssueEditor(issue, onSave)
  const box = useRef<HTMLInputElement>(null)
  const editing = editor.mode === 'editing'
  const open = () => {
    editor.pencil()
    // The same input turns editable, so focusing it now lets Enter and Escape work at once.
    box.current?.focus()
  }
  const takeTheirs = () => {
    editor.takeTheirs()
    // The link-button unmounts with the notice, which would drop focus to the page.
    box.current?.focus()
  }
  return (
    <div className="form-group row">
      <div className="col">
        <div className="input-group">
          <input
            ref={box}
            type="text"
            placeholder="Current issue"
            className="form-control"
            value={editor.text}
            readOnly={!editing}
            onChange={e => editor.type(e.target.value)}
            onKeyDown={e => {
              // Enter also confirms an input method's composition, which is not a save.
              // Safari ends it first, so that Enter has isComposing false and keyCode 229.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') editor.submit()
              else if (e.key === 'Escape') editor.cancel()
            }}
          />
          <div className="input-group-append">
            {editor.mode === 'viewing' ? (
              <button
                className="btn btn-outline-secondary"
                type="button"
                aria-label="Edit issue"
                onClick={open}
              >
                <Pen size={20} />
              </button>
            ) : (
              <>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  aria-label="Save issue"
                  disabled={!editing}
                  onClick={editor.submit}
                >
                  <Check size={20} />
                </button>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  aria-label="Cancel editing"
                  disabled={!editing}
                  onClick={editor.cancel}
                >
                  <X size={20} />
                </button>
              </>
            )}
          </div>
        </div>
        {editor.notice !== null && (
          <small className="form-text text-muted">
            Changed by someone else to: "{editor.notice}"{' '}
            <button type="button" className="btn btn-link btn-sm p-0" onClick={takeTheirs}>
              Use theirs
            </button>
          </small>
        )}
        {editor.failed && <small className="form-text text-danger">Could not save the issue</small>}
      </div>
    </div>
  )
}
