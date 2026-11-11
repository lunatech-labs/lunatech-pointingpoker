import type { KeyboardEvent, MouseEvent, SyntheticEvent } from 'react'

// The press rules spare the field, so a double-click there still selects a word.
const onButton = (e: SyntheticEvent) => e.target instanceof Element && !!e.target.closest('button')

// Capture handlers a form's container spreads, so one press does one thing.
export const pressRules = {
  // A double-click's second press moves no focus, so it stays in the field it opened.
  onMouseDownCapture: (e: MouseEvent) => {
    if (e.detail > 1 && onButton(e)) e.preventDefault()
  },
  // Drops a double-click's second click: on Cancel in Edit's place, or on a dialog's button again.
  onClickCapture: (e: MouseEvent) => {
    if (e.detail > 1 && onButton(e)) {
      e.stopPropagation()
      e.preventDefault()
    }
  },
  // A held Enter's repeats are dropped, as on the round bar.
  onKeyDownCapture: (e: KeyboardEvent) => {
    if (e.repeat && e.key === 'Enter') e.preventDefault()
  }
}
