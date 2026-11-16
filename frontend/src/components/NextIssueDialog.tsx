import './issue-editor.css'
import './next-issue-dialog.css'
import { useId } from 'react'
import { ArrowRight, X } from 'lucide-react'
import type { useNextIssue } from './useNextIssue'
import { type Choice, sameChoice } from '../room/nextIssue'
import { shortForm } from '../room/history'
import { estimationValues } from './Deck'
import { fieldKey } from './fieldKey'
import { Figure } from './Figure'
import { Message } from './Message'
import { MovedOn } from './MovedOn'
import { pressRules } from './pressRules'
import { useFocusWithin } from './useFocusWithin'

type Props = { next: ReturnType<typeof useNextIssue>; issue: string; position: number; onClosed: () => void }

// The estimate row's radios (round history spec, decision 3): the deck values, then Unsettled and Skip.
const choices: Choice[] = [
  ...estimationValues.map((value): Choice => ({ type: 'Estimate', value })),
  { type: 'Unsettled' },
  { type: 'Skip' }
]

// The Next issue dialog (Next issue spec, decision 7); RoomPage holds its state through useNextIssue.
export function NextIssueDialog({ next, issue, position, onClosed }: Props) {
  const [within, focusRules] = useFocusWithin()
  const title = useId()
  const field = useId()
  const radios = useId()
  const { mode, draft, choice, failed, missing, movedOn, dialogRef, fieldRef, firstRadioRef } = next
  const { type, choose, submit, cancel, onClose, onCancelEvent } = next
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
      onClose={e => {
        // A close event that finds the dialog open again is a late one, from before the reopen.
        if (e.currentTarget.open) return
        onClose()
        onClosed()
      }}
    >
      <h2 id={title}>Next issue</h2>
      {!movedOn && (
        <div className="next-form">
          <fieldset className="next-estimate">
            <legend className="panel-label">
              Estimate for <bdi className="next-form-issue">{shortForm(issue, position).text}</bdi>
            </legend>
            <div className="next-chips">
              {choices.map((c, i) => (
                <label
                  key={c.type === 'Estimate' ? c.value : c.type}
                  className={c.type === 'Estimate' ? 'next-chip' : 'next-chip next-chip-word'}
                >
                  <input
                    ref={i === 0 ? firstRadioRef : undefined}
                    className="visually-hidden"
                    type="radio"
                    name={radios}
                    checked={sameChoice(choice, c)}
                    aria-disabled={sending || undefined}
                    onChange={() => choose(c)}
                  />
                  {c.type === 'Estimate' ? <Figure value={c.value} /> : c.type}
                </label>
              ))}
            </div>
          </fieldset>
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
        </div>
      )}
      {/* Always rendered: a screen reader announces changes to a region, not one appearing. */}
      <div className="next-dialog-status" role="status">
        {movedOn && <MovedOn issue={issue} focus={within} onOk={cancel} />}
        {failed && <Message tone="problem">Could not move on to the next issue</Message>}
        {missing && <Message tone="problem">Choose an estimate, Unsettled or Skip</Message>}
      </div>
    </dialog>
  )
}
