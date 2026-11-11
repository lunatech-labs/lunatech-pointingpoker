import './issue-panel.css'
import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Pencil } from 'lucide-react'
import { useIssueEditor } from './useIssueEditor'
import { IssueEditor } from './IssueEditor'
import { Message } from './Message'
import { MovedOn } from './MovedOn'
import { pressRules } from './pressRules'
import { useFocusWithin } from './useFocusWithin'

type Props = {
  issue: string
  round: number
  onSave: (issue: string) => Promise<void>
}

const focusFell = () => document.activeElement === null || document.activeElement === document.body

// A URL issue as room.html's segments, plain text and not a link yet (decision 11).
function segments(issue: string) {
  const scheme = issue.match(/^https?:\/\//)?.[0]
  if (scheme === undefined) return issue
  const [host, ...path] = issue.slice(scheme.length).split('/')
  const dotted = host.split('.').flatMap((part, i) => (i ? ['.', <wbr key={i} />, part] : [part]))
  return [
    <span key={0} className="issue-panel-seg">
      {scheme}
      {dotted}
    </span>,
    ...path.map((piece, i) => (
      <span key={i + 1} className="issue-panel-seg">
        /{piece}
      </span>
    ))
  ]
}

export function IssuePanel({ issue, round, onSave }: Props) {
  const editor = useIssueEditor(issue, round, onSave)
  const [within, focusRules] = useFocusWithin()
  const box = useRef<HTMLTextAreaElement>(null)
  const group = useRef<HTMLElement>(null)
  const edit = useRef<HTMLButtonElement>(null)
  const was = useRef(editor.mode)
  const open = () => {
    // Render editable before focusing: iOS shows no keyboard for focus on a readonly field.
    flushSync(() => editor.pencil())
    box.current?.focus()
    // React mounts a textarea's text as its content, which leaves the caret at the start.
    const end = box.current?.value.length ?? 0
    box.current?.setSelectionRange(end, end)
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
    // The Use theirs button unmounts with the notice, which would drop focus to the page.
    box.current?.focus()
  }
  return (
    <section
      ref={group}
      className="panel issue-panel"
      aria-label="Issue"
      {...pressRules}
      {...focusRules}
    >
      {editor.mode === 'viewing' ? (
        <div className="issue-panel-view">
          <h2 data-testid="issue-text" className={editor.text ? undefined : 'issue-panel-empty'}>
            {editor.text ? segments(editor.text) : 'No issue yet'}
          </h2>
          <button
            ref={edit}
            className="button-quiet"
            type="button"
            aria-label="Edit issue"
            onClick={open}
          >
            <Pencil />
            Edit
          </button>
        </div>
      ) : editor.movedOn ? null : (
        <IssueEditor
          text={editor.text}
          editing={editor.mode === 'editing'}
          boxRef={box}
          onType={editor.type}
          onSubmit={editor.submit}
          onCancel={editor.cancel}
        />
      )}
      {/* Always rendered: a screen reader announces changes to a region, not one appearing. */}
      <div className="issue-panel-status" role="status" data-testid="issue-status">
        {editor.movedOn && <MovedOn issue={issue} focus={within} onOk={editor.cancel} />}
        {editor.failed && (
          <Message tone="problem">Could not save the issue</Message>
        )}
        {editor.notice !== null && (
          <Message tone="notice">
            Changed by someone else to: "{editor.notice}"{' '}
            <button type="button" className="button-quiet" onClick={takeTheirs}>
              Use theirs
            </button>
          </Message>
        )}
      </div>
    </section>
  )
}
