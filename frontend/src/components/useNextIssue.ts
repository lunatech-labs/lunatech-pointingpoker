import { type SyntheticEvent, useLayoutEffect, useReducer, useRef } from 'react'
import { flushSync } from 'react-dom'
import { type Choice, type Legend, closed, shows, step } from '../room/nextIssue'

// The Next issue dialog's matrix held in React; the send's promise answers the request it awaits.
export function useNextIssue(
  issue: string,
  round: number,
  send: (round: number, issue: string, outcome: Choice) => Promise<void>
) {
  const [state, dispatch] = useReducer(step, closed)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const firstRadioRef = useRef<HTMLInputElement>(null)
  const counter = useRef(0)
  // Closes go through state (Next issue plan, ruling 5); after Escape the element is closed already.
  useLayoutEffect(() => {
    if (state.mode === 'closed' && dialogRef.current?.open) dialogRef.current.close()
  }, [state.mode])

  // All in the press's handler: iOS opens the keyboard only for a focus set during the tap.
  const open = (checked: Choice | null) => {
    flushSync(() => dispatch({ type: 'pressed', issue, round, checked }))
    dialogRef.current?.showModal()
    fieldRef.current?.focus()
    fieldRef.current?.select()
  }

  const submit = (legend: Legend) => {
    if (state.mode !== 'open') return
    const request = ++counter.current
    dispatch({ type: 'submit', request, legend })
    const { choice } = state
    // With nothing checked the step asks for a choice and nothing is sent.
    if (choice === null) {
      firstRadioRef.current?.focus()
      return
    }
    send(state.opening, state.draft, choice).then(
      () => dispatch({ type: 'answered', request, ok: true }),
      () => dispatch({ type: 'answered', request, ok: false })
    )
  }

  return {
    ...shows(state, round),
    dialogRef,
    fieldRef,
    firstRadioRef,
    open,
    type: (text: string) => dispatch({ type: 'typed', text }),
    choose: (choice: Choice) => dispatch({ type: 'chose', choice }),
    submit,
    cancel: () => dispatch({ type: 'cancel' }),
    onClose: () => dispatch({ type: 'closed' }),
    // Escape does not close the dialog while sending.
    onCancelEvent: (e: SyntheticEvent) => {
      if (state.mode === 'sending') e.preventDefault()
    }
  }
}
