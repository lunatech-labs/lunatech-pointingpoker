// The issue editor's states and events, the spec's matrix; useIssueEditor wires it to React.
export type Mode = 'viewing' | 'editing' | 'saving'

export type EditorState = {
  mode: Mode
  // The store's issue, as the last snapshot carried it.
  store: string
  draft: string
  start: string
  failed: boolean
  // The store's issue when saving began, which the saved text waits for the store to leave.
  before: string
  saved: string | null
  // The last snapshot's round, and the round the pencil opened in.
  round: number
  opening: number
}

export type EditorEvent =
  | { type: 'pencil' }
  | { type: 'typed'; text: string }
  | { type: 'save' }
  | { type: 'cancel' }
  | { type: 'theirs' }
  | { type: 'snapshot'; issue: string; round: number }
  | { type: 'succeeded' }
  | { type: 'failed' }

export const initial = (issue: string, round: number): EditorState => ({
  mode: 'viewing',
  store: issue,
  draft: '',
  start: '',
  failed: false,
  before: issue,
  saved: null,
  round,
  opening: round
})

// The spec's "room's issue": the store's, or the saved text while it waits.
const roomIssue = (s: EditorState) => s.saved ?? s.store

// A draft is one line: line breaks at the ends go, a run inside becomes one space.
export const oneLine = (text: string) =>
  text.replace(/^[\r\n]+|[\r\n]+$/g, '').replace(/[\r\n]+/g, ' ')

// Every event outside its state is ignored, which covers the matrix's "Cannot happen" cells too.
export function step(s: EditorState, e: EditorEvent): EditorState {
  switch (e.type) {
    case 'snapshot': {
      // The saved text belongs to its round, so a later round clears it.
      const keep = e.issue === s.before && e.round === s.round
      return { ...s, store: e.issue, round: e.round, saved: keep ? s.saved : null }
    }
    case 'pencil':
      if (s.mode !== 'viewing') return s
      return {
        ...s,
        mode: 'editing',
        draft: oneLine(roomIssue(s)),
        start: roomIssue(s),
        failed: false,
        opening: s.round
      }
    case 'typed':
      return s.mode === 'editing' ? { ...s, draft: oneLine(e.text) } : s
    case 'save':
      return s.mode === 'editing' ? { ...s, mode: 'saving', failed: false, before: s.store } : s
    case 'cancel':
      return s.mode === 'editing' ? { ...s, mode: 'viewing' } : s
    case 'theirs':
      return s.mode === 'editing' ? { ...s, draft: oneLine(roomIssue(s)), start: roomIssue(s) } : s
    case 'succeeded': {
      if (s.mode !== 'saving') return s
      // A frame that beat the response has already moved the store, so nothing is left to wait for.
      // Nor is there once the room moved on: the saved text belongs to its round.
      const waits = s.store === s.before && s.round === s.opening
      return { ...s, mode: 'viewing', saved: waits ? s.draft : null }
    }
    case 'failed':
      return s.mode === 'saving' ? { ...s, mode: 'editing', failed: true } : s
  }
}

export type EditorView = {
  mode: Mode
  text: string
  notice: string | null
  failed: boolean
  // The room moved on since the pencil: the notice replaces the form, its conflict line and failure.
  movedOn: boolean
}

export function shows(s: EditorState): EditorView {
  const room = roomIssue(s)
  if (s.mode === 'viewing')
    return { mode: s.mode, text: room, notice: null, failed: false, movedOn: false }
  if (s.mode === 'editing' && s.round !== s.opening)
    return { mode: s.mode, text: s.draft, notice: null, failed: false, movedOn: true }
  const conflict = s.mode === 'editing' && room !== s.start && room !== s.draft
  return {
    mode: s.mode,
    text: s.draft,
    notice: conflict ? room : null,
    failed: s.failed,
    movedOn: false
  }
}
