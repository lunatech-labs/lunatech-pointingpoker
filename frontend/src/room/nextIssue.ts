import { oneLine } from './issueEditor'
import { resultHeadline } from './result'

// The notice that replaces a form once the room moves on (Next issue spec, Terms).
export const movedOnText = (issue: string) =>
  issue ? `The room moved on to: "${issue}"` : 'The room moved on, with no issue yet'

// The Next issue dialog's states and events, the Next issue spec's matrix; every other event leaves the state as is.
export type NextState =
  | { mode: 'closed' }
  | { mode: 'open'; opening: number; draft: string; failed: boolean }
  | { mode: 'sending'; opening: number; draft: string; awaiting: number }

export type NextEvent =
  | { type: 'pressed'; issue: string; round: number }
  | { type: 'typed'; text: string }
  | { type: 'submit'; request: number }
  | { type: 'cancel' } // Cancel or OK
  | { type: 'closed' } // the element's close event
  | { type: 'answered'; request: number; ok: boolean }

export const closed: NextState = { mode: 'closed' }

// The dialog's choice of outcome; Skip moves on and records nothing.
export type Choice = { type: 'Estimate'; value: string } | { type: 'Unsettled' } | { type: 'Skip' }

// The estimate the dialog starts on: the one value alone on top once revealed, if it is on the deck.
export function preselected(
  deck: readonly string[],
  revealed: boolean,
  summary: [string, number][]
): Choice | null {
  if (!revealed) return null
  const { tied } = resultHeadline(deck, summary)
  return tied.length === 1 && deck.includes(tied[0]) ? { type: 'Estimate', value: tied[0] } : null
}

export function step(s: NextState, e: NextEvent): NextState {
  switch (e.type) {
    // A press reaches the page only while the element is closed, so its close event is still due.
    case 'pressed':
      return { mode: 'open', opening: e.round, draft: oneLine(e.issue), failed: false }
    case 'typed':
      return s.mode === 'open' ? { ...s, draft: oneLine(e.text) } : s
    case 'submit':
      return s.mode === 'open'
        ? {
            mode: 'sending',
            opening: s.opening,
            draft: s.draft,
            awaiting: e.request
          }
        : s
    case 'cancel':
      return s.mode === 'open' ? closed : s
    case 'closed':
      return s.mode === 'closed' ? s : closed
    case 'answered':
      if (s.mode !== 'sending' || s.awaiting !== e.request) return s
      return e.ok ? closed : { mode: 'open', opening: s.opening, draft: s.draft, failed: true }
  }
}

export function shows(
  s: NextState,
  round: number
): {
  mode: NextState['mode']
  draft: string
  failed: boolean
  movedOn: boolean
} {
  if (s.mode === 'closed') return { mode: s.mode, draft: '', failed: false, movedOn: false }
  if (s.mode === 'sending') return { mode: s.mode, draft: s.draft, failed: false, movedOn: false }
  const movedOn = round !== s.opening
  return {
    mode: s.mode,
    draft: s.draft,
    failed: s.failed && !movedOn,
    movedOn
  }
}
