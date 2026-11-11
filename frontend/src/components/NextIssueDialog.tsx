import './issue-editor.css'
import './next-issue-dialog.css'
import { useId } from 'react'
import { ArrowRight, X } from 'lucide-react'
import type { useNextIssue } from './useNextIssue'
import { fieldKey } from './fieldKey'
import { Message } from './Message'
import { MovedOn } from './MovedOn'
import { pressRules } from './pressRules'
import { useFocusWithin } from './useFocusWithin'

type Props = { next: ReturnType<typeof useNextIssue>; issue: string; onClosed: () => void }

// The Next issue dialog (spec decision 7); RoomPage holds its state through useNextIssue.
export function NextIssueDialog({ next, issue, onClosed }: Props) {
  const [within, focusRules] = useFocusWithin()
  const title = useId()
  const field = useId()
  const { mode, draft, failed, movedOn, dialogRef, fieldRef } = next
  const { type, submit, cancel, onClose, onCancelEvent } = next
  const sending = mode === 'sending'
  return (
    <dialog
      ref={dialogRef}
      className="panel next-dialog"
      aria-labelledby={title}
      {...pressRules}
      {...focusRules}
      // A press on the backdrop or the dialog's padding leaves focus where it is.
      onMouseDown={e => e.target === e.currentTarget && e.preventDefault()}
      onCancel={onCancelEvent}
      onClose={() => {
        onClose()
        onClosed()
      }}
    >
      <h2 id={title}>Next issue</h2>
      {!movedOn && (
        <div className="next-dialog-part">
          <label className="panel-label" htmlFor={field}>
            Next issue
          </label>
          <div className="issue-editor">
            <textarea
              id={field}
              ref={fieldRef}
              rows={1}
              enterKeyHint="done"
              className="issue-editor-field"
              value={draft}
              readOnly={sending}
              onChange={e => type(e.target.value)}
              // Escape is the dialog's own; fieldKey drops a repeat or a composing Enter.
              onKeyDown={e => fieldKey(e) === 'Enter' && submit()}
            />
            <div className="issue-editor-actions">
              <button
                className="button button-primary"
                type="button"
                aria-disabled={sending || undefined}
                onClick={submit}
              >
                <ArrowRight />
                <span className="button-word">Next issue</span>
              </button>
              <button
                className="button button-secondary"
                type="button"
                aria-disabled={sending || undefined}
                onClick={cancel}
              >
                <X />
                <span className="button-word">Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Always rendered: a screen reader announces changes to a region, not one appearing. */}
      <div className="next-dialog-status" role="status">
        {movedOn && <MovedOn issue={issue} focus={within} onOk={cancel} />}
        {failed && <Message tone="problem">Could not move on to the next issue</Message>}
      </div>
    </dialog>
  )
}
