import { type SyntheticEvent, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Check, Pen, X } from 'lucide-react'
import { useIssueEditor } from './useIssueEditor'

type Props = {
  issue: string
  onSave: (issue: string) => Promise<void>
}

const focusFell = () => document.activeElement === null || document.activeElement === document.body
// The press rules spare the field, so a double-click there still selects a word.
const onButton = (e: SyntheticEvent) => e.target instanceof Element && !!e.target.closest('button')

export function IssueEditor({ issue, onSave }: Props) {
  const editor = useIssueEditor(issue, onSave)
  const box = useRef<HTMLInputElement>(null)
  const group = useRef<HTMLDivElement>(null)
  const edit = useRef<HTMLButtonElement>(null)
  const was = useRef(editor.mode)
  const editing = editor.mode === 'editing'
  const open = () => {
    // Render editable before focusing: iOS shows no keyboard for focus on a readonly input.
    flushSync(() => editor.pencil())
    box.current?.focus()
  }
  // After a failed save, the field takes focus only if focus fell to the page.
  useEffect(() => {
    if (editor.failed && focusFell()) box.current?.focus()
  }, [editor.failed])
  // On a close, Edit takes focus if focus was in the editor or fell.
  useEffect(() => {
    const closed = was.current !== 'viewing' && editor.mode === 'viewing'
    was.current = editor.mode
    if (closed && (focusFell() || group.current?.contains(document.activeElement)))
      edit.current?.focus()
  }, [editor.mode])
  const takeTheirs = () => {
    editor.takeTheirs()
    // The link-button unmounts with the notice, which would drop focus to the page.
    box.current?.focus()
  }
  return (
    <div
      ref={group}
      className="form-group row"
      // A double-click's second press moves no focus, so it stays in the field it opened.
      onMouseDownCapture={e => e.detail > 1 && onButton(e) && e.preventDefault()}
      // Drops a double-click's second click, which lands on Cancel in Edit's place.
      onClickCapture={e => {
        if (e.detail > 1 && onButton(e)) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
      // A held Enter's repeats are dropped, as on the round bar.
      onKeyDownCapture={e => e.repeat && e.key === 'Enter' && e.preventDefault()}
    >
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
              // A capture preventDefault does not stop this handler, so it drops repeats itself.
              if (e.repeat) return
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
                ref={edit}
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
                  className={`btn btn-outline-secondary${editing ? '' : ' disabled'}`}
                  type="button"
                  aria-label="Save issue"
                  aria-disabled={!editing || undefined}
                  onClick={editor.submit}
                >
                  <Check size={20} />
                </button>
                <button
                  className={`btn btn-outline-secondary${editing ? '' : ' disabled'}`}
                  type="button"
                  aria-label="Cancel editing"
                  aria-disabled={!editing || undefined}
                  onClick={editor.cancel}
                >
                  <X size={20} />
                </button>
              </>
            )}
          </div>
        </div>
        {/* Always rendered: a screen reader announces changes to a region, not one appearing. */}
        <div role="status" data-testid="issue-status">
          {editor.notice !== null && (
            <small className="form-text text-muted">
              Changed by someone else to: "{editor.notice}"{' '}
              <button type="button" className="btn btn-link btn-sm p-0" onClick={takeTheirs}>
                Use theirs
              </button>
            </small>
          )}
          {editor.failed && (
            <small className="form-text text-danger">Could not save the issue</small>
          )}
        </div>
      </div>
    </div>
  )
}
