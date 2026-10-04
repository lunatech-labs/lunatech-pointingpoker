import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Check, Pen, X } from 'lucide-react'
import { useIssueEditor } from './useIssueEditor'

type Props = {
  issue: string
  onSave: (issue: string) => Promise<void>
}

export function IssueEditor({ issue, onSave }: Props) {
  const editor = useIssueEditor(issue, onSave)
  const box = useRef<HTMLInputElement>(null)
  const group = useRef<HTMLDivElement>(null)
  const editing = editor.mode === 'editing'
  const open = () => {
    // Render editable before focusing: iOS shows no keyboard for focus on a readonly input.
    flushSync(() => editor.pencil())
    box.current?.focus()
  }
  // The check was disabled while saving, which dropped focus; take it back so Enter retries.
  useEffect(() => {
    const at = document.activeElement
    const dropped = at === null || at === document.body || group.current?.contains(at)
    if (editor.failed && dropped) box.current?.focus()
  }, [editor.failed])
  const takeTheirs = () => {
    editor.takeTheirs()
    // The link-button unmounts with the notice, which would drop focus to the page.
    box.current?.focus()
  }
  return (
    <div ref={group} className="form-group row">
      <div className="col">
        <div className="input-group">
          <input
            ref={box}
            type="text"
            placeholder="Current issue"
            aria-label="Current issue"
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
