import { type SyntheticEvent, useLayoutEffect, useReducer, useRef } from 'react'
import { flushSync } from 'react-dom'
import { closed, shows, step } from '../room/nextIssue'

// The Next issue dialog's matrix held in React; the send's promise answers the request it awaits.
export function useNextIssue(
  issue: string,
  round: number,
  send: (round: number, issue: string) => Promise<void>
) {
  const [state, dispatch] = useReducer(step, closed)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const counter = useRef(0)
  // Closes go through state (Next issue plan, ruling 5); after Escape the element is closed already.
  useLayoutEffect(() => {
    if (state.mode === 'closed' && dialogRef.current?.open) dialogRef.current.close()
  }, [state.mode])

  // All in the press's handler: iOS opens the keyboard only for a focus set during the tap.
  const open = () => {
    flushSync(() => dispatch({ type: 'pressed', issue, round }))
    dialogRef.current?.showModal()
    fieldRef.current?.focus()
    fieldRef.current?.select()
  }

  const submit = () => {
    if (state.mode !== 'open') return
    const request = ++counter.current
    dispatch({ type: 'submit', request })
    send(state.opening, state.draft).then(
      () => dispatch({ type: 'answered', request, ok: true }),
      () => dispatch({ type: 'answered', request, ok: false })
    )
  }

  return {
    ...shows(state, round),
    dialogRef,
    fieldRef,
    open,
    type: (text: string) => dispatch({ type: 'typed', text }),
    submit,
    cancel: () => dispatch({ type: 'cancel' }),
    onClose: () => dispatch({ type: 'closed' }),
    // Escape does not close the dialog while sending.
    onCancelEvent: (e: SyntheticEvent) => {
      if (state.mode === 'sending') e.preventDefault()
    }
  }
}
