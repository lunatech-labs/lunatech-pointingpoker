import { oneLine } from './issueEditor'
import { resultHeadline } from './result'

// What the dialog's legend shows: the issue and history position it was submitted with, text and link derived at render.
export type Legend = { issue: string; position: number }

// The Next issue dialog's matrix (Next issue and round history specs); every other event leaves the state as is.
export type NextState =
  | { mode: 'closed' }
  | { mode: 'open'; opening: number; draft: string; choice: Choice | null; failed: boolean; missing: boolean }
  | { mode: 'sending'; opening: number; draft: string; choice: Choice; awaiting: number; legend: Legend }

export type NextEvent =
  | { type: 'pressed'; issue: string; round: number; checked: Choice | null }
  | { type: 'typed'; text: string }
  | { type: 'chose'; choice: Choice }
  | { type: 'submit'; request: number; legend: Legend }
  | { type: 'cancel' } // Cancel or OK
  | { type: 'closed' } // the element's close event
  | { type: 'answered'; request: number; ok: boolean }

export const closed: NextState = { mode: 'closed' }

// The dialog's choice of outcome; Skip moves on and records nothing.
export type Choice = { type: 'Estimate'; value: string } | { type: 'Parked' } | { type: 'Skip' }

export const sameChoice = (a: Choice | null, b: Choice) =>
  a?.type === b.type && (a.type !== 'Estimate' || (b.type === 'Estimate' && a.value === b.value))

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
      return {
        mode: 'open',
        opening: e.round,
        draft: oneLine(e.issue),
        choice: e.checked,
        failed: false,
        missing: false
      }
    case 'typed':
      return s.mode === 'open' ? { ...s, draft: oneLine(e.text) } : s
    case 'chose':
      return s.mode === 'open' ? { ...s, choice: e.choice, missing: false } : s
    case 'submit':
      if (s.mode !== 'open') return s
      if (s.choice === null) return { ...s, missing: true }
      return {
        mode: 'sending',
        opening: s.opening,
        draft: s.draft,
        choice: s.choice,
        awaiting: e.request,
        legend: e.legend
      }
    case 'cancel':
      return s.mode === 'open' ? closed : s
    case 'closed':
      return s.mode === 'closed' ? s : closed
    case 'answered':
      if (s.mode !== 'sending' || s.awaiting !== e.request) return s
      return e.ok
        ? closed
        : { mode: 'open', opening: s.opening, draft: s.draft, choice: s.choice, failed: true, missing: false }
  }
}

export function shows(
  s: NextState,
  round: number
): {
  mode: NextState['mode']
  draft: string
  choice: Choice | null
  failed: boolean
  missing: boolean
  movedOn: boolean
  legend: Legend | null
} {
  const none = { failed: false, missing: false, movedOn: false }
  if (s.mode === 'closed') return { mode: s.mode, draft: '', choice: null, legend: null, ...none }
  if (s.mode === 'sending') return { mode: s.mode, draft: s.draft, choice: s.choice, legend: s.legend, ...none }
  const movedOn = round !== s.opening
  return {
    mode: s.mode,
    draft: s.draft,
    choice: s.choice,
    failed: s.failed && !movedOn,
    missing: s.missing && !movedOn,
    movedOn,
    legend: null
  }
}
