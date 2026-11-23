import { useLayoutEffect, useRef, useState } from 'react'
import { IssueLink } from './IssueLink'
import { Message } from './Message'

type Props = { issue: string; focus: boolean; onOk: () => void }

// The notice that replaces a form once the room moves on; it takes focus if the form held it.
export function MovedOn({ issue, focus, onOk }: Props) {
  // Captured at mount: by the first effect, focus has already fallen from the replaced form.
  const [held] = useState(focus)
  const text = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (held) text.current?.focus()
  }, [held])
  return (
    <Message tone="notice">
      <span ref={text} tabIndex={-1}>
        {issue ? (
          <>
            The room moved on to: "<IssueLink issue={issue}>{issue}</IssueLink>"
          </>
        ) : (
          'The room moved on, with no issue yet'
        )}
      </span>{' '}
      <button type="button" className="button-quiet" onClick={onOk}>
        OK
      </button>
    </Message>
  )
}
