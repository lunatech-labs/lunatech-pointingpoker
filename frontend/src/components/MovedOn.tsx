import { useLayoutEffect, useRef, useState } from 'react'
import { movedOnText } from '../room/nextIssue'
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
        {movedOnText(issue)}
      </span>{' '}
      <button type="button" className="button-quiet" onClick={onOk}>
        OK
      </button>
    </Message>
  )
}
